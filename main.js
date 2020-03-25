const LOG_PREFIX = '[哔哩哔哩猜你喜欢]';

let activeTab = null; // 当前tab
let recommandMax = 12; // 一次获取几个推荐视频

// ajax
const HTTP = {
	get(url) {
		return new Promise((resolve, reject) => {
			let xhr = new XMLHttpRequest();
			xhr.open('GET', url);
			xhr.onload = () => {
				if( xhr.status == 200 ) {
					resolve(xhr.responseText);
				} else {
					reject(xhr.status);
				}
			}
			xhr.send();
		});
	}
}

// database
const DB = {
	local: chrome.storage.local,
	get(key, cb) {
		DB.local.get(key, (data) => {
			if( typeof(key) == 'string' ) {
				typeof(cb) == 'function' && cb(data[key]);
			} else {
				typeof(cb) == 'function' && cb(data);
			}
		});
	},
	set(obj, cb) {
		DB.local.set(obj, cb);
	},
	remove(key) {
		DB.local.remove(key);
	},
	saveRecommands(bvid, videos) {
		let obj = {};
		obj[bvid] = videos;
		DB.set(obj);
		DB.recommandsCountAdd(videos.length);
	},
	recommandsCountAdd(delta) {
		DB.get('count', (_c) => {
			let count = _c || 0;
			count += delta;
			DB.set({count});
		});
	},
	logUserViewHistory(bvid) {
		DB.getUserViewHistory((history) => {
			history.unshift(bvid);
			// 保持访问记录最多99条
			if( history.length > 99 ) {
				let removedId = history.pop();
				// 如果被删除的bvid在之后的记录中没有再次访问，那么删除这个bvid对应的推荐视频
				if( !history.includes(removedId) ) {
					DB.get(removedId, (v) => {
						DB.remove(removedId);
						DB.recommandsCountAdd(-v.length);
					});
				}
			}
			DB.set({history});
		});
	},
	getUserViewHistory(cb) {
		DB.get('history', (history) => {
			cb(history || []);
		});
	}
}

// 获取推荐
const RECOMMAND = {
	// 获取av号对应的推荐视频
	get(bvid) {
		DB.get(bvid, (videos) => {
			if( !videos ) {
				// 没有获取过推荐视频要去服务端获取
				HTTP.get(`https://api.bilibili.com/x/web-interface/view/detail?bvid=${bvid}&aid=&jsonp=jsonp&callback=_`).then((_raw) => {
					let raw = _raw.substring(2, _raw.length - 1);
					let res;
					try {
						res = JSON.parse(raw);
					} catch(e) {
						return console.error(`${LOG_PREFIX} 解析detail接口返回值失败：${e}`);
					}
					if( res.code != 0 ) {
						return console.error(`${LOG_PREFIX} detail接口的返回值不为0：${res}`);
					}
					// 去掉我们不需要的信息，节约存储空间..
					let data = res.data.Related.map((v) => {
						return {
							aid: v.aid,
							bvid: v.bvid,
							title: v.title,
							pic: v.pic.replace('http://', 'https://'), // 返回的图片地址里带了http://，append到dom tree的时候会出警告，我们自己处理掉
							duration: v.duration,
							stat: v.stat,
							up: v.owner
						}
					});
					// 保存到数据库
					DB.saveRecommands(String(bvid), data);
				});
			}
		});
	},
	// 根据当前用户访问记录获取n个随机推荐视频
	recommand(n) {
		DB.getUserViewHistory((vh) => {
			let max = Math.min(12, vh.length); // 只根据最近观看的12个视频来生成推荐
			let keys = vh.slice(0, max);
			DB.get(keys, (recommandArray) => {
				let allVideos = [];
				keys.forEach((key) => {
					allVideos = allVideos.concat(recommandArray[key]);
				});
				let max = Math.min(allVideos.length, n);
				let ids = [], videos = [];
				while( ids.length < max ) {
					let i = Math.floor(Math.random() * allVideos.length);
					const v = allVideos[i];
					if( !ids.includes(v.bvid) ) {
						ids.push(v.bvid);
						videos.push(v);
					}
				};
				UI.updateRecommands(videos);
			});
		});
	}
}

// 与页面交互的逻辑
const UI = {
	node: null,
	// 是否首页
	isIndex() {
		let path = window.location.pathname;
		if( path == '/' || path == '/index.html' ) {
			return true
		} else {
			return false;
		}
	},
	// 是否视频播放页
	isVideo() {
		let path = window.location.pathname;
		if( path.indexOf('video/BV') > -1 ) {
			return true;
		} else {
			return false;
		}
	},
	// 获取BVID
	getBVID() {
		let url = window.location.href,
				m = /\/BV(\w+)/.exec(url);
		if( m ) {
			return m[1];
		} else {
			console.error(`${LOG_PREFIX} 找不到BV号：${url}`);
		}
		return null;
	},
	// 插入推荐模块
	insertRecommands() {
		return new Promise((resolve, reject) => {
			// 复制「动画」模块来做一个「猜你喜欢」
			// 20191125 b站改版，几个首页模块变成后渲染了，需要异步获取
			let refSearchCount = 0;
			function loopFrame() {
				// 插入dom
				let douga = document.querySelector('#bili_douga');
				if( !douga ) {
					if( refSearchCount < 99 ) {
						setTimeout(loopFrame, 100);
						refSearchCount++;
						return;
					} else {
						throw new Error('无法获取到#bili_douga');
					}
				}
				const node = douga.cloneNode(true);
				node.id = '_bili_guessyoulike';
				// 仅保留视频列表部分，其他东西统统删掉（有时候会有广告
				Array.from(node.children).filter(c=>!c.classList.contains('report-scroll-module')).forEach(c=>c.remove());
				// 替换文本内容
				const name = node.querySelector('.name');
				name.href = 'javascript: null;';
				name.target = '';
				name.textContent = '猜你喜欢';
				// 修改结构
				const text = document.createElement('div');
				text.innerHTML = '<div class="text-info" style="color: #ccc;"><span>这是一个非官方的猜你喜欢模块，有任何建议或bug反馈请联系 <a href="https://weibo.com/chitosai" target="_blank">@千歳</a></span></div>'
				name.insertAdjacentElement('afterend', text);
				// 移除右侧「排行」
				const rank = node.querySelector('.rank-list');
				rank.remove();
				// 移除「更多」
				const more = node.querySelector('.btn.more');
				more.remove();
				// 「换一换」默认创建出来一直在转圈。。神经病啊
				const changeButtonIcon = node.querySelector('.bili-icon_caozuo_huanyihuan');
				changeButtonIcon.classList.remove('quan');
				const change = node.querySelector('.btn-change');
				// 点这个按钮就通知插件换一批推荐视频
				change.addEventListener('click', () => {
					window.postMessage({
						type: 'UPDATE_RECOMMANDS'
					}, '*');
				});
				// 插入页面
				let ref = document.querySelector('#reportFirst1');
				ref.insertAdjacentElement('afterend', node);
				UI.node = node;
				// 插入样式
				const styleSheet = document.createElement('style');
				styleSheet.type = 'text/css';
				const styleList = [
					// 把猜你喜欢视频平铺占满100%，每行显示6个
					'#_bili_guessyoulike .zone-list-box { width: 100% !important; }' + 
					'#_bili_guessyoulike .video-card-common { width: 15.6%; }' +
					'#_bili_guessyoulike .video-card-common:nth-child(n+9) { display: block; }' +
					// 1438px以下宽度时每行只显示5个视频，不然太密集了
					'@media screen and (max-width: 1438px) { ' + 
						'#_bili_guessyoulike .video-card-common { width: 19%; }' +
						'#_bili_guessyoulike .video-card-common:nth-child(n+11) { display: none; }' +
					'}'
				]
				styleSheet.textContent = styleList.join('');
				document.head.append(styleSheet);
				resolve();
			}
			loopFrame();
		});
	},
	// 获取推荐模块的引用
	getRecommandNode() {
		return new Promise(async (resolve) => {
			// 检查是否有已插入的节点
			UI.node = document.querySelector('#_bili_guessyoulike');
			if( !UI.node ) {
				// 没有就创建
				await UI.insertRecommands();
			}
			resolve();
		});
	},
	async updateRecommands(videos) {
		await UI.getRecommandNode();
		const node = UI.node;
		// 移除原有的视频
		const stage = node.querySelector('.zone-list-box');
		let html = '';
		if( videos.length ) {
			function toWan(number) {
				return number > 9999 ? ((number/10000).toFixed(1) + '万') : number;
			}
			function toMin(seconds) {
				return Math.floor(seconds/60) + ':' + (seconds % 60);
			}
			// 插入新视频
			videos.forEach((video) => {
				let v = `<div class="video-card-common"><div class="card-pic" data-aid="${video.aid}" data-bvid="${video.bvid}"><a href="/video/${video.bvid}" target="_blank"><img src="${video.pic}@206w_116h_1c_100q.webp"><div class="count"><div class="left"><span><i class="bilifont bili-icon_shipin_bofangshu"></i>${toWan(video.stat.view)}</span><span><i class="bilifont bili-icon_shipin_dianzanshu"></i>${toWan(video.stat.like)}</span></div><div class="right"><span>${toMin(video.duration)}</span></div></div></a></div><a href="/video/${video.bvid}" target="_blank" title="${video.title}" class="title">${video.title}</a><a href="//space.bilibili.com/${video.up.mid}/" target="_blank" class="up"><i class="bilifont bili-icon_xinxi_UPzhu"></i>${video.up.name}</a></div>`;
				html += v;
			});
		} else {
			html = '<p style="color: #777; line-height: 360px; text-align: center; width: 100%;">观看记录为空，快去看几个视频吧~</p>';
		}
		stage.innerHTML = html;
		// 绑定van-framepreview
		Array.from(stage.querySelectorAll('.card-pic')).forEach(bili_van_framepreview);
	},
	// 监听来自页面的更新请求
	listen() {
		window.addEventListener('message', (ev) => {
			if( ev.data.type && ev.data.type == 'UPDATE_RECOMMANDS' ) {
				RECOMMAND.recommand(recommandMax);
			}
		});
	}
}

// 在视频页直接点击关联视频并不会刷新页面，而是直接ajax加载改变url，所以我们要监听hashchange
// 试了下hashchange事件好像监听不到？不知道为啥，写个dirty check吧
const URLLISTENER = {
	timer: null,
	bvid: '',
	tick() {
		const bvid = UI.getBVID();
		if( bvid !== URLLISTENER.bvid ) {
			DB.logUserViewHistory(bvid);
			RECOMMAND.get(bvid);
			URLLISTENER.bvid = bvid;
			console.log(`${LOG_PREFIX} Logged ${bvid}`);
		}
	},
	init() {
		URLLISTENER.timer = setInterval(URLLISTENER.tick, 10000); // 10s检查一次差不多了吧
		URLLISTENER.tick();
	}
}

function init() {
	// 当前是否首页？
	if( UI.isIndex() ) {
		RECOMMAND.recommand(recommandMax);
		UI.listen();
	}
	// 当前是否视频播放页？
	// 如果是视频播放页，则获取当前视频的相关推荐视频
	if( UI.isVideo() ) {
		URLLISTENER.init();
	}
}

// 增加了bvid字段，需要清除以前的数据
DB.get('_20200325_clear_data', (data) => {
	if( data ) {
		init();
	} else {
		chrome.storage.local.clear(() => {
			DB.set({'_20200325_clear_data': true});
			init();
		});
	}
});