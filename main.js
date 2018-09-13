let activeTab = null; // 当前tab

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
	saveRecommands(aid, videos) {
		let obj = {};
		obj[aid] = videos;
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
	logUserViewHistory(aid) {
		DB.getUserViewHistory((history) => {
			history.unshift(aid);
			// 保持访问记录最多99条
			if( history.length > 99 ) {
				let removedId = history.pop();
				// 如果被删除的aid在之后的记录中没有再次访问，那么删除这个aid对应的推荐视频
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
	get(aid) {
		DB.get(aid, (videos) => {
			if( !videos ) {
				// 没有获取过推荐视频要去服务端获取
				HTTP.get(`https://comment.bilibili.com/recommendnew,${aid}`).then((raw) => {
					let res;
					try {
						res = JSON.parse(raw);
					} catch(e) {
						return console.error(`解析recommandnew接口返回值失败：${e}`);
					}
					// 去掉我们不需要的信息，节约存储空间..
					let data = res.data.map((v) => {
						return {
							aid: v.aid,
							title: v.title,
							pic: v.pic,
							stat: v.stat
						}
					});
					// 保存到数据库
					DB.saveRecommands(String(aid), data);
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
					if( !ids.includes(v.aid) ) {
						ids.push(v.aid);
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
		if( path.indexOf('video/av') > -1 ) {
			return true;
		} else {
			return false;
		}
	},
	// 插入推荐模块
	insertRecommands() {
		// 复制「动画」模块来做一个「猜你喜欢」
		let douga = document.querySelector('#bili_douga');
		let node = douga.cloneNode(true);
		node.id = '_bili_guessyoulike';
		// 替换文本内容
		let name = node.querySelector('.name');
		name.href = 'javascript: null;';
		name.textContent = '猜你喜欢';
		// 修改结构
		let text = node.querySelector('.bili-tab');
		text.innerHTML = '这是一个非官方的猜你喜欢模块，有任何建议或bug反馈请联系 <a href="https://weibo.com/chitosai" target="_blank">@千歳</a>';
		text.style.margin = '3px 0 0 0';
		text.style.color = '#ccc';
		let rank = node.querySelector('.sec-rank');
		rank.innerHTML = '';
		rank.style.width = '80px';
		rank.style.height = '530px';
		rank.style.background = '#f0f0f0';
		let more = node.querySelector('.link-more');
		// 创建一个「换一换」按钮
		let btn = document.createElement('div');
		btn.classList.add('read-push');
		btn.style.marginLeft = '-5px';
		btn.innerHTML = '<i class="icon icon_read"></i><span class="info">换一批</span>';
		// 点这个按钮就通知插件换一批推荐视频
		btn.addEventListener('click', () => {
			window.postMessage({
				type: 'UPDATE_RECOMMANDS'
			}, '*');
		});
		more.insertAdjacentElement('afterend', btn);
		more.remove();
		// 扩大左边
		node.querySelector('.new-comers-module').style.width = 'calc(100% - 80px)';
		// 插入页面
		let ref = document.querySelector('#chief_recommend');
		ref.insertAdjacentElement('afterend', node);
		return node;
	},
	updateRecommands(videos) {
		let node = document.querySelector('#_bili_guessyoulike') || UI.insertRecommands();
		// 移除原有的视频
		let stage = node.querySelector('.storey-box');
		stage.style.height = '486px';
		let html = '';
		if( videos.length ) {
			function toWan(number) {
				return number > 9999 ? ((number/10000).toFixed(1) + '万') : number;
			}
			// 插入新视频
			videos.forEach((video) => {
				let v = `<div class="spread-module"><a href="/video/av${video.aid}/" target="_blank"><div class="pic"><div class="lazy-img"><img src="${video.pic}@160w_100h.webp"></div></div><p title="${video.title}" class="t">${video.title}</p><p class="num"><span class="play"><i class="icon"></i>${toWan(video.stat.view)}</span><span class="danmu"><i class="icon"></i>${toWan(video.stat.danmaku)}</span></p></a></div>`;
				html += v;
			});
		} else {
			html = '<p style="color: #777; line-height: 486px; text-align: center;">观看记录为空，快去看几个视频吧~</p>';
		}
		stage.innerHTML = html;
	},
	// 监听来自页面的更新请求
	listen() {
		window.addEventListener('message', (ev) => {
			if( ev.data.type && ev.data.type == 'UPDATE_RECOMMANDS' ) {
				RECOMMAND.recommand(20);
			}
		});
	}
}

// 当前是否首页？
if( UI.isIndex() ) {
	RECOMMAND.recommand(20);
	UI.listen();
}
// 当前是否视频播放页？
// 如果是视频播放页，则获取当前视频的相关推荐视频
if( UI.isVideo() ) {
	let url = window.location.href,
		m = /\/av(\d+)/.exec(url);
	if( m ) {
		let aid = m[1];
		DB.logUserViewHistory(aid);
		RECOMMAND.get(aid);
	} else {
		console.error(`找不到av号：${url}`);
	}
}