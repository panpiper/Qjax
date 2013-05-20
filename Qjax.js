/*
 * Qjax.js
 * A JavaScript tool that manages multiple queues of AJAX requests
 *
 */
var Qjax=(function() {
  var threads=[],
    threadsCache={},
    settings={
        queueLimit:     Infinity,
        delay:          0,
        timeout:        Infinity,
        maxAttempts:    5,
        maxAsync:       Infinity,
    },
    backlog             =null,
    lastServed          =null,
    concurrent          =0,
    accepts={
        text:   'text/plain, */*; q=0.1',
        html:   'text/html, */*; q=0.1',
        xml:    'application/xml, text/xml, */*; q=0.1',
        json:   'application/json, text/javascript, */*; q=0.1',
        script: 'text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.1'
    },
    statusClasses={
        1: 'informational',
        2: 'successful',
        3: 'redirection',
        4: 'clientError',
        5: 'serverError'
    },

    // Returns an XMLHttpRequest object
    getXHR=function() {
        try {
            return new XMLHttpRequest();
        }catch(e) {
            try {
                return new ActiveXObject('Msxml2.XMLHTTP');
            }catch(e) {
                try {
                    return new ActiveXObject('Microsoft.XMLHTTP');
                }catch(e) {
                    throw new Error('Qjax: Unable to create an XMLHttpRequest object.');
                }
            }
        }
    },

    // Dispatch a request
    dispatch=function(request) {
        var thread      =request.thread,
            timeoutID   =null;
            xhr         =getXHR();

        request.attempts++;

        if(request.async) {
            xhr.onreadystatechange=function() {
                if(this.readyState==4) {
                    var statusClass=statusClasses[this.status.toString().charAt(0)];
                    switch(statusClass) {
                        case 'successful':
                            switch(request.dataType) {
                                case 'json':
                                    this.responseData=JSON.parse(this.response);
                                    break;
                                case 'xml':
                                case 'html':
                                    this.responseData=this.responseXML;
                                    break;
                                default:
                                    this.responseData=this.responseText;
                                    break;
                            }
                            if(request.callback.success instanceof Function) {
                                request.callback.success.apply(this);
                            }
                            break;
                        case 'clientError':
                        case 'serverError':
                            if(request.callback.error instanceof Function) {
                                request.callback.error.apply(this);
                            }
                            break;
                    }
                    if(request.callback[this.status] instanceof Function) {
                        request.callback[this.status].apply(this);
                    }
                }
            };
            for(var e in {loadstart:1,progress:1,load:1,abort:1,error:1,loadend:1}) {
                if(request.callback[e] instanceof Function) {
                    xhr.addEventListener(e,request.callback[e],false);
                }
            }
            xhr.addEventListener('error',function() { return thread.onTransportError.apply(thread,[request]); });
            xhr.addEventListener('abort',function() { return thread.onTransportAbort.apply(thread,[request]); });
            xhr.addEventListener('loadend',function() { return thread.onTransportComplete.apply(thread,[request]); });
            xhr.addEventListener('loadend',function() {
                clearTimeout(timeoutID);
                concurrent--;
                triggerEdge();
            });
        }
        xhr.open(request.method,request.url,request.async,request.username,request.password);

        for(var key in request.headers) {
            xhr.setRequestHeader(key,request.headers[key]);
        }
        xhr.send(request.data);

        if(request.async) {
            if(request.timeout<Infinity) {
                timeoutID=setTimeout(function() {
                    xhr.abort();
                    if(request.callback.timeout instanceof Function) {
                        request.callback.timeout.apply(xhr);
                    }
                },request.timeout);
            }
        }else {
            thread.onTransportComplete.apply(thread,[request]);
            triggerEdge();
        }
    },

    // Dispatch a request in `request.delay` milliseconds
    delayDispatch=function(request) {
        setTimeout(function() { return dispatch.apply(this,[request]); },request.delay);
    },

    // Returns true if the limit of concurrent asynchronous requests has been reached
    asyncLimitReached=function() {
        return concurrent>=settings.maxAsync;
    },

    // Serve all available threads
    serveThreads=function() {
        while(!asyncLimitReached() && !backlog.isEmpty()) {
            var request=backlog.queue.shift();
            if(request instanceof Request) {
                concurrent++;
                delayDispatch(request);
            }
        }
        if(threads.length) {
            var index=0;
            if(lastServed instanceof Thread) {
                for(var i=0, j=threads.length; i<j; i++) {
                    if(threads[i].id==lastServed.id) {
                        index=i;
                        break;
                    }
                }
            }
            index=(index>=threads.length-1) ? 0 : index+1;
            for(var i=0, j=threads.length; i<j; i++) {
                if(index >= threads.length) {
                    index-=threads.length;
                }
                var thread=threads[index];
                if(!asyncLimitReached() && !thread.isPaused() && !thread.isEmpty() && !thread.isPending()) {
                    thread.trigger('beforeNext');
                    if(!thread.isPaused() && !thread.isEmpty()) {
                        var request=thread.getRequestForTransport();
                        if(request instanceof Request) {
                            concurrent++;
                            delayDispatch(request);
                        }
                        lastServed=thread;
                    }
                }
                index++;
            }
        }
    },
    triggerEdge=function() {
        serveThreads();
    },

    // Request class
    Request=function(opts,thread) {
        this.thread         =thread;
        this.url            =opts.url;
        this.async          =opts.async || true;
        this.dataType       =(opts.dataType || '').toLowerCase();
        this.data           =opts.data;
        this.convertData    =opts.convertData || true;
        this.contentType    =opts.contentType;
        this.priority       =opts.priority || 10;
        this.headers        =opts.headers || {};
        this.username       =opts.username || null,
        this.password       =opts.password || null,
        this.timeout        =opts.timeout || thread.settings.timeout;
        this.delay          =opts.delay || thread.settings.delay;
        this.maxAttempts    =opts.maxAttempts || thread.settings.maxAttempts;
        this.attempts       =0;
        this.method         =(/^(GET|POST|PUT|DELETE)$/i.test(opts.method)) ? opts.method.toUpperCase() : 'GET';

        if(opts.callback instanceof Function) {
            this.callback={successs:opts.callback};
        }else if(opts.callback instanceof Object) {
            this.callback=opts.callback;
        }else {
            this.callback={};
        }
        if(!this.headers.hasOwnProperty('Accept')) {
            if(({text:1,html:1,xml:1,json:1,script:1})[this.dataType]) {
                this.headers['Accept']=accepts[this.dataType];
            }
        }
        if(this.convertData && this.data && typeof this.data=='object') {
            this.data=this.convertDataFn(this.data);

            if(this.method=='GET') {
                this.url+='?'+this.data;
                this.data=null;
            }
        }
        if(this.contentType) {
            this.headers['Content-Type']=this.contentType;
        }else if(this.data) {
            this.headers['Content-Type']='application/x-www-form-urlencoded; charset=UTF-8';
        }
        if(!this.headers.hasOwnProperty('X-Requested-With')) {
            this.headers['X-Requested-With']='XMLHttpRequest';
        }
        if(!this.url) throw new Error('Qjax: Invalid URL');
    };
    Request.prototype={
        convertDataFn: function(data) {
            var parsed=[];
            this.parseData(data,'',parsed);
            return parsed.join('&');
        },
        parseData: function(data,key,uriParts) {
            if(data instanceof Array) {
                for(var i=0, j=data.length; i<j; i++) {
                    if(key) {
                        var _key=(typeof data[i]=='object') ? key +'['+i+']' : key+'[]';
                    }else {
                        var _key=key + i;
                    }
                    this.parseData(data[i],_key,uriParts);
                }
            }else if(data instanceof Object) {
                for(var k in data) {
                    var _key=key ? key +'['+k+']' : k;
                    this.parseData(data[k],_key,uriParts);
                }
            }else {
                uriParts.push(encodeURIComponent(key)+'='+data);
            }
        }
    };

    // The queue data structure
    var Queue=function() {
        this.requests={};
    };
    Queue.prototype={
        // Returns the number of enqueued requests
        length: function() {
            var l=0;
            for(var n in this.requests) {
                l+=this.requests[n].length;
            }
            return l;
        },
        // Appends a request to the back of a priority partition of the queue.
        push: function(r) {
            if(!(this.requests[r.priority] instanceof Array)) {
                this.requests[r.priority]=[];
            }
            this.requests[r.priority].push(r);
        },
        // Returns the next request in line
        shift: function() {
            for(var n in this.requests) {
                var request=this.requests[n].shift();
                if(!this.requests[n]) {
                    delete this.requests[n];
                }
                return request;
            }
        },
        // Returns a reference to the next request in line
        top: function() {
            for(var n in this.requests) {
                return this.requests[n];
            }
        },
        // Clear the queue
        clear: function() {
            this.requests={};
        }
    };

    // Returns a proxy for the Thread object
    var PublicThread=function(thread) {
        return {
            enqueue: function(opts) {
                thread.enqueue(opts);
            },
            pause: function() {
                thread.pause();
            },
            resume: function() {
                thread.resume();
            },
            clear: function() {
                thread.clear();
            },
            isPaused: function() {
                return thread.isPaused();
            },
            isEmpty: function() {
                return thread.isEmpty();
            },
            isPending: function() {
                return thread.isPending();
            },
            on: function(event,fn) {
                thread.on(event,fn);
            },
            getLength: function() {
                return thread.queue.length();
            },
            nextRequest: function() {
                return thread.queue.top();
            },
            lastServed: function() {
                return thread.lastServed;
            }
        }
    },

    // The Thread class
    Thread=function(id,opts) {
        opts=opts || {};
        this.id=id;
        this.queue=new Queue();
        this.settings={
            limit:          opts.limit || settings.queueLimit,
            delay:          opts.delay || settings.delay,
            timeout:        opts.timeout || settings.timeout,
            maxAttempts:    opts.maxAttempts || settings.maxAttempts
        };
        this.eventHandlers={
            beforeNext: null,
            empty: null
        };
        this.state={
            pending: false,
            paused: false
        };
        this.lastServed=null;
        this.current=null;
        this.onDeck=null;
    };

    // Thread methods
    Thread.prototype={

        // Returns the next request in line to be dispatched
        getRequestForTransport: function() {
            this.current=this.queue.shift();
            this.onDeck=this.queue.top();
            this.state.pending=true;
            return this.current;
        },

        // XHR error callback - maybe re-enqueue
        onTransportError: function(request) {
            if(this.queue.length() >= this.settings.limit) {
                if(request.attempts < request.maxAttempts) {
                    this.queue.push(request);
                }
            }
        },

        // XHR abort callback - maybe re-enqueue
        onTransportAbort: function(request) {
            if(this.queue.length() >= this.settings.limit) {
                if(request.attempts < request.maxAttempts) {
                    this.queue.push(request);
                }
            }
        },

        // XHR complete callback - trigger edge state
        onTransportComplete: function(request) {
            this.state.pending=false;
            this.lastServed=request;
            if(!this.queue.length()) {
                this.trigger('empty');
            }
            triggerEdge();
        },

        // Set an event handler or handlers
        on: function(e,fn) {
            if(e instanceof Object) {
                for(var key in e) {
                    if(this.eventHandlers.hasOwnProperty(key)) {
                        if(e[key] instanceof Function) {
                            this.eventHandlers[key]=e[key];
                        }
                    }
                }
            }else {
                if(this.eventHandlers.hasOwnProperty(e)) {
                    this.eventHandlers[e]=fn;
                }
            }
        },

        // Triggers an event
        trigger: function(e) {
            if(this.eventHandlers[e] instanceof Function) {
                this.eventHandlers[e].apply(PublicThread(this))
            }
        },

        // Halts the execution of requests after the current one completes
        pause: function() {
            this.state.paused=true;
        },

        // Unblocks the thread
        resume: function() {
            this.state.paused=false;
        },

        // Clears the queue of requests
        clear: function() {
            this.queue.clear();
        },

        // Returns true if the thread is paused
        isPaused: function() {
            return this.state.paused;
        },

        // Returns true if the thread has a request in transit
        isPending: function() {
            return this.state.pending;
        },

        // Returns true if the thread has no requests in queue
        isEmpty: function() {
            return !this.queue.length();
        },

        // Enqueue a request
        enqueue: function(opts) {
            if(this.queue.length() >= this.settings.limit) {
                return;
            }
            this.queue.push(new Request(opts,this));
            triggerEdge();
        }
    };
    backlog=new Thread();

    // Public access
    return {

        // Set global settings
        settings: function(opts) {
            for(var o in opts) {
                if(settings.hasOwnProperty(o)) {
                    settings[o]=opts[o];
                }
            }
        },

        // Returns true if the maximum number of asynchronous requests has been met 
        asyncLimitReached: function() {
            return asyncLimitReached();
        },

        // Creates a new thread, returns its proxy for public access 
        createThread: function(id,opts) {
            threadsCache[id]=new Thread(id,opts);
            threads.push(threadsCache[id]);
            return PublicThread(threadsCache[id]);
        },

        // Returns a proxy for the thread specified by the id
        thread: function(id) {
            if(threadsCache[id] instanceof Thread) {
                return PublicThread(threadsCache[id]);
            }
        },

        // Enqueue a request to a user defined thread or the backlog thread
        enqueue: function(threadID,requestOptions) {
            threadsCache[threadID].enqueue(requestOptions);
        },

        // Dispatches a stand-alone request or enqueues it in the backlog if the maximum
        // number of asynchronous requests has been met
        send: function(url,rOptions) {
            if(typeof url=='string') {
                rOptions=rOptions || {};
                rOptions.url=url;
            }else {
                rOptions=url;
            }
            backlog.enqueue(rOptions);
        },

        // A couple useful time managing utilities
        Utils: {

            // Returns a function that will execute once per time interval 
            throttle: function(fn,delay,context) {
                delay=delay || 1000;
                context=context || this;
                var timeID=+new Date();

                return function() {
                    if(+new Date()-timeID > delay) {
                        fn.apply(context,arguments);
                        timeID=+new Date();
                    }
                }
            },

            // Returns a function that will execute only before or after a time interval
            debounce: function(fn,delay,pre,context) {
                delay=delay || 1000;
                context=(pre instanceof Object) ? pre : context || this;
                pre=(typeof pre=='boolean') ? pre : false;
                var timeID, active;

                return function() {
                    clearTimeout(timeID);
                    if(pre) {
                        if(typeof active=='undefined') {
                            fn.apply(context,arguments);
                            active=true;
                        }
                        timeID=setTimeout(function() { active=undefined; },delay);
                    }else {
                        timeID=setTimeout(function() { fn.apply(context,arguments); },delay);
                    }
                };
            }
        }
    };
})();
