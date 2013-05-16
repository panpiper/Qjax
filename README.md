#Qjax
A JavaScript tool that manages multiple queues of AJAX requests

##Usage
####Stand-alone requests
 ```javascript
Qjax.send('url'); //translates to a GET request
Qjax.send('url',{method:'POST'});
```
or
```javascript
Qjax.send({
    url: 'someurl',
    method: 'PUT',
    async: false
});
```
####Enqueuing requests
 ```javascript
var thread=Qjax.createThread('myNewThread');
thread.enqueue({
    url: 'someurl',
    method: 'GET',
    dataType: 'json'
});
```
or
 ```javascript
Qjax.createThread('myNewThread');
Qjax.thread('myNewThread').enqueue({
    url: 'someurl',
    dataType: 'json',
    data: {
        foo: true,
        bar: false
    }
});
```
