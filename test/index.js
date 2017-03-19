import Module from '../src/.';

const module = new Module(null, null, 'http://tv.kakao.com/channel/2711620/livelink/257748');
module.on('message', (data)=>console.info(JSON.stringify(data)))
module.connect();
setTimeout(()=>module.disconnect(), 30000);