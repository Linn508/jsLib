function Mvvm(options = {}) {
    //Vue是将所有属性挂载到vm.$option上面的
    this.$options = options  //将所有属性挂载在$options上
    //this._data
    var data = this._data = this.$options.data
    //数据劫持
    observe(data)
    /*
    我们希望直接通过构造函数的实例访问到其中的属性:mvvm.a而不是mvvm._data.a的形式
    所以需要做一个数据代理
    */
   //this代理了this._data 
   for (let key in data) {
       Object.defineProperty(this,key,{
           enumerable:true,
           get(){
               return this._data[key]  //this.a = {a:1}
           },
           set(newVal){
               this._data[key] = newVal
           }
       })
   }
   initComputed.call(this)
   new Compile(options.el,this)
}

function initComputed() {   
    //具有缓存功能
    //不需要观察者，它的值只依赖用户在computed里面定义的函数值/对象值，当发生改变的时候才会触发computed里面的函数/对象
    let vm = this   //默认保存一下this
    let computed = this.$options.computed  //从options上拿到computed属性  
    //方法：Objected.keys  可以把对象obj={name:1,age:2}变成数组[name,age]
    Object.keys(computed).forEach(function (key){
        Object.defineProperty(vm,key,{   //取出computed[key]
            enumerable:true,
            //这里判断computed里面的key是对象还是函数
            //如果是函数，直接调用get方法  如sum(){return this.a+this.b},他们获取a和b的值就会调用get方法
            //如果是对象，需要手动去调用该对象的get方法
            //所以不需要new Watcher去监听变化
            get:typeof computed[key]==='function'?computed[key]:computed[key].get,  
            set(){
            }
        })
    })
}

function Compile(el,vm) {
    //先拿到el:表示替换的范围,并将el挂载到$el方便使用
    vm.$el = document.querySelector(el)
    //在el范围里将内容都拿到，当然不能一个一个拿
    //可以选择移到内存中去然后放入文档碎片中，节省开销
    //移到内存中操作修改比起在DOM树上直接操作有利于性能提升
    let fragment= document.createDocumentFragment()  //移到文档碎片
    while(child = vm.$el.firstChild){ //将el中的内容 移入到内存中
        fragment.appendChild(child)
    }
    //对el里面的内容进行替换
    replace(fragment)  //替换内容
    function replace(fragment) {
        Array.from(fragment.childNodes).forEach(function (node) {//循环每一层
            var text = node.textContent
            var reg = /\{\{(.*)\}\}/    //正则匹配{{ }}
            //{{}}的实现
            if(node.nodeType===3 &&reg.test(text)){//既是文本节点又有大括号的情况
                let arr = RegExp.$1.split('.') //[a,a]  [b]
                let val = vm
                arr.forEach(function (k) {  //取this.a.a  this.b
                    val = val[k]
                })
                new Watcher(vm,RegExp.$1,function (newVal) { //函数里需要接收一个新值
                    node.textContent = text.replace(/\{\{(.*)\}\}/,newVal)
                })
                //替换的逻辑
                node.textContent = text.replace(/\{\{(.*)\}\}/,val)
            }

            //v-model的实现
            if(node.nodeType===1){
                //元素节点
                let nodeAttrs = node.attributes  //获取当前DOM节点的属性
                //将类数组转换为数组并遍历
                Array.from(nodeAttrs).forEach(function (attr) {
                    let name = attr.name        //属性名字：type  v-mode
                    let exp = attr.value        //属性的值：text  b
                    if(name.indexOf('v-')==0){  //以v-开头：v-model
                        node.value = vm[exp]    //this.b为  '是b'
                    }
                    //监听变化 每次更改值，就应该改变
                    new Watcher(vm,exp,function (newVal) {
                        node.value = newVal    //当watcher触发时，会自动将内容放到输入框内
                    })
                    node.addEventListener('input',function (e) {
                        let newVal = e.target.value
                        //相当于给this.b赋了一个新值
                        //而值的改变会调用set，set中又会调用notify，notify中调用watcher的update方法实现了更新
                        vm[exp] = newVal
                    })
                })
            }
            //如果还有子节点，继续递归replace
            if(node.childNodes && node.childNodes.length){
                replace(node)
            }
        })
    }
    
    vm.$el.appendChild(fragment)   //再把最后的文档碎片塞回页面
}

/*
关于递归，为什么要递归？
因为可能属性的值还是一个对象，那这个对象里面就还有属性
*/
//观察对象给对象增加Object.DefineProperty
function Observe(data) {  //这里写我们的主要逻辑
    let dep = new Dep()
    //所谓数据劫持，就是给对象增加get set
    //先遍历一遍对象再说
    for (let key in data) {  //把data属性通过Object.defineProperty方式定义属性
        let val = data[key]  //先拿到data里面的属性的值
        observe(val)  //递归向下继续找，实现深度的数据劫持
        Object.defineProperty(data,key,{
            enumerable:true,  //默认情况下defineProperty定义的属性是不能枚举(遍历)的
            get(){
                Dep.target&&dep.addSub(Dep.target)     //[watcher]
                return val
            },
            set(newValue){//更改值的时候
                if(newValue === val){//设置的值和以前一样，直接返回
                    return
                }  
                val = newValue  //如果以后再获取值(get)的时候，将刚才设置的值通过get返回
                observe(newValue)//当设置为新值以后，也需要把新值再去定义成属性
                dep.notify()   //让所有的watch的update方法执行即可
            }
        })
    }
}

function observe(data) {
    //如果不是对象就直接返回
    //需要判断，避免内存泄漏
    if(!data || typeof data !=='object') return
    return new Observe(data)
}

//Vue特点不能新增不存在的属性  不存在的属性没有get和set
//深度响应：因为每次赋予一个新对象时，会给这个新对象增加数据劫持(即用Object.defineProperty)

//发布订阅
/*
1.数据劫持、数据代理都已经实现，即都可以检测数据变化
2.数据已经实现编译在页面上可以通过{{}}显示，但是我们手动修改后的数据并没有在页面上改变，还差最后的响应式
3.接下来就要用到发布订阅模式
==> 发布订阅模式主要靠数组关系，订阅就是放入函数，发布就是让数组里的函数执行
发布订阅模式：先有订阅   再有发布  
    订阅：有一个方法会帮我们订阅一个事件，这个方法会把订阅的事件放到一个数组里面：如[fn1,fn2,fn3]
    发布：当我们要发布的时候，只需要把这个数组循环遍历一遍，把里面的事件依次执行

    Dep是存放函数的事件池  
    Watcher是一个监听函数  
    现在我们要订阅一个事件，当数据改变需要重新刷新视图，这就需要在replace替换的逻辑里来处理
    通过在replace里面new Watcher把数据订阅一下，数据一变就执行改变内容的操作
*/

//绑定的方法 都有一个update属性 每个sub里面都有一个update方法
function Dep() {
    //一个数组，存放函数的事件池
    this.subs = []
}
Dep.prototype.addSub = function (sub) {  //把订阅的函数sub加进去
    this.subs.push(sub)
}
Dep.prototype.notify = function () {
    this.subs.forEach(sub => sub.update())
}
//监听函数
//Watch是一个类，通过这个类创建的实例都拥有update方法
function Watcher(vm,exp,fn) {   // exp是表达式  
    this.fn = fn    //把fn放到实例上
    this.vm = vm
    this.exp = exp   //添加到订阅中
    Dep.target = this
    let val = vm
    let arr = exp.split(".")
    arr.forEach(function (k) {
        val = val[k]  //取this.a.a
    })
    Dep.target = null
}
Watcher.prototype.update = function () {
    let val = this.vm
    let arr = this.exp.split(".")
    arr.forEach(function (k) { //this.a.a
        val = val[k]
    })
    this.fn(val)            //newVal
}

