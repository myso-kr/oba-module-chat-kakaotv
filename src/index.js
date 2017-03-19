import _ from 'lodash';
import Promise from 'bluebird';
import Logger from 'debug';
import EventEmitter from 'events'
import URL from 'url';
import Util from 'util';
import Net from 'net';
import fetch from 'node-fetch';

const HTTP_USER_AGENT = 'KakaoTVLive/1.0.4';
const URL_ORIGIN = 'http://m.afreecatv.com';
const URL_BROADCAST_META = "https://tv.kakao.com/api/v1/app/livelinks/%s?fields=*";
const URL_BROADCAST_SOCK = "https://play.daum.net/chat/service/api/room";

export default class Module extends EventEmitter {
	constructor(oba, options, url) {
		super();
		this.name = "oba:chat:kakaotv";
		this.oba = oba || new EventEmitter();
		this.stdout = Logger(`${this.name}`);
		this.stderr = Logger(`${this.name}:error`);

		const uri = URL.parse(url, true, true);
        const segments = _.split(uri.pathname, '/');
        this.defaults = {
        	name: this.name,
        	source: url, 
        	caster: {
        		username: _.get(segments, 2),
        		identify: _.get(segments, 4)
        	}
        };
        this.options = _.merge({}, this.defaults, options);
        this.socket = new Socket(this);
	}

	connect() { this.socket.connect(); }

	disconnect() { this.socket.disconnect(); }

	async meta() {
        const resp = await fetch(Util.format(URL_BROADCAST_META, this.defaults.caster.identify)).then((resp) => resp.json());
        return resp;
	}
	async sock(meta) {
		const chattingGroupId = _.get(meta, 'live.liveAdditionalData.chattingGroupId');
		const resp = await fetch(URL_BROADCAST_SOCK, {
            method: 'POST', body: `groupid=${chattingGroupId}`,
            headers: {
                'User-Agent': HTTP_USER_AGENT,
                'Authorization': '',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }).then((resp)=>resp.json());
        return resp;
	}
}

class Socket extends EventEmitter {
	constructor(module) {
		super();
		this.module = module;
		this.events = [];
		this.addEventPacketName("message", /^\:[\w]{8}-[\w]{4}-[\w]{4}-[\w]{4}-[\w]{12} MSG ([^ ]+) ALL NORMAL (.*)$/);
        this.addEventPacketName("message", /^\:[\w]{8}-[\w]{4}-[\w]{4}-[\w]{4}-[\w]{12} AMSG ([^ ]+) ALL NORMAL (.*)$/);
	}
	addEventPacketName(eventName, matchPattern, callback) {
        this.events.push({ eventName, matchPattern });
	}
	getEventPacketName(packetData) {
		return _.get(_.find(this.events, (event) => event.matchPattern.test(packetData)), 'eventName');
	}
	getEventPAcketData(packetData) {
		return _.invoke(_.get(_.find(this.events, (event) => event.matchPattern.test(packetData)), 'matchPattern'), 'exec', packetData);
	}

	connect() {
		if(this.native) return;
		this.native = true;
		Promise.resolve().then(async () => {
			const meta = await this.module.meta();
            const sock = await this.module.sock(meta);
            const host = _.get(sock, 'roomInfo.serverip');
            const port = _.get(sock, 'roomInfo.port')*1;
            const base = _.get(sock, 'enter');

            let buffer = [];
            const socket = this.native = new Net.Socket();
            socket.connect(port, host, () => this.emit('connect'));
            socket.on('error', (e) => this.emit('error', e));
            socket.on('close', () => {
            	this.native = null;
            	this.emit('close');
            });
            socket.on('data', (data) => {
            	const block = data.toString(); buffer.push(block);
            	const last = _.last(_.split(block, '\n'));
            	if(last !== '') return;

            	const messages = _.join(buffer); buffer = [];
            	_.each(_.split(messages, '\n'), (data) => {
                    const eventName = this.getEventPacketName(data);
                    const eventData = this.getEventPAcketData(data);
                    if (eventName && eventData) { this.emit(eventName, eventData) }
                });
            });
            this.on('connect', () => this.native.write(`ENTER ${base}\n`));
            
	        this.on('connect', () => this.module.emit('connect'));
            this.on('error', (e) => this.module.emit('error', e));
            this.on('close', () => this.module.emit('close'));
	        this.on('message', (segments) => {
	        	this.module.emit('message', {
                    module: this.module.defaults,
                    username: _.get(segments, 1),
                    nickname: _.get(segments, 1),
                    message: _.get(JSON.parse(_.get(segments, 2)), 'msg'),
                    timestamp: Date.now()
                });
	        });
		});
	}
	disconnect() {
		if(!this.native) return;
		this.native.destroy();
	}
}