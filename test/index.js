import Module from '../src/.';

const module = new Module(null, null, 'http://tv.kakao.com/channel/2658059/livelink/259864');
module.on('message', (data)=>console.info(JSON.stringify(data)))
module.connect();
setTimeout(()=>module.disconnect(), 5000);