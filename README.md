#Qjax
A JavaScript tool that manages multiple queues of AJAX requests.

#####Dependencies: none

##Usage
######Stand-alone requests
Dispatch requests immediately, bypassing any queuing mechanism with `send`.
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
######Enqueuing requests
Each request will be dispatched in a First-In-First-Out sequence. In other words, requests will be
served consecutively, each waiting for the previous request to complete.
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
######Thread Options
| Option       | Type    | Description
| ------------ |:-------:|:----------------------------------------------------------------------------------------- |
| limit        | Integer | The maximum number of requests to enqueue.                                                |
| delay        | Integer | The delay in milliseconds before dispatching each request. Overridden per request option. | 
| timeout      | Integer | The maximum wait time in milliseconds for each request. Overridden per request option.    | 
| maxAttempts  | Integer | The maximum number of failed attempts before dropping the request from the queue.         |


######Request Options
| Option       | Type          | Description
| ------------ |:-------------:|:--------------------------------------------------------------------------------- |
| url          | String        | The request URL.                                                                  |
| async        | Boolean       | If false, will dispatch request synchronously. Default: true.                     |
| dataType     | String        | Data type expected from the server. e.g.: 'json','html','text'.                   |
| data         | Object/String | Data to send to the server. This can be an object or a string.                    |
| convertData  | Boolean       | Data is converted to a query string. Set to false to send data as is.             |
| contentType  | String        | The value of the content-type header. Represents the data sent to the server.     | 
| priority     | Integer       | The request will be enqueued according to the priority passed.                    |
| headers      | Object        | An object of all headers to send to the server.                                   |
| username     | String        | Username for HTTP authentication.                                                 |
| password     | String        | Password for HTTP authentication.                                                 |
| timeout      | Number        | The number of milliseconds to wait for the request before aborting.               |
| delay        | Number        | The number of miLliseconds before dispatching.                                    |
| maxAttempts  | Integer       | The maximum number of failed attempts before dropping the request from the queue. |
