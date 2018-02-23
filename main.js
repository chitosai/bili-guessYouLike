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
	saveRecommands(aid, videos) {
		let obj = {};
		obj[aid] = videos;
		DB.set(obj);
	},
	logUserViewHistory(aid) {
		DB.getUserViewHistory((history) => {
			if( !history ) {
				history = [];
			} else if( !history.includes(aid) ) {
				history.push(aid);
				if( history.length > 30 ) {
					history.shift();
				}
			}
			DB.set({history});
		});
	},
	getUserViewHistory(cb) {
		DB.get('history', (history) => {
			cb(history);
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
					let data = res.data;
					data.forEach((v) => {
						v._ts = new Date();
					});
					// 保存到数据库
					DB.saveRecommands(String(aid), data);
				});
			}
		});
	},
	// 根据当前用户访问记录获取n个随机推荐视频
	query(n) {
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
					if( !ids.includes(i) ) {
						ids.push(i);
						videos.push(allVideos[i]);
					}
				};
				UI.insertRecommand(videos);
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
	insertRecommand(videos) {
		let node = document.querySelector('#_bili_guessyoulike');
		if( !node ) {
			// 复制「动画」模块来做一个「猜你喜欢」
			let douga = document.querySelector('#bili_douga');
			node = douga.cloneNode(true);
			node.id = '_bili_guessyoulike';
			// 替换文本内容
			let name = node.querySelector('.name');
			name.href = undefined;
			name.textContent = '猜你喜欢';
			// 移除不需要的dom
			node.querySelector('.bili-tab').remove();
			node.querySelector('.link-more').remove();
			node.querySelector('.sec-rank').remove();
			// 扩大左边
			node.querySelector('.new-comers-module').style.width = '100%';
		}
		// 移除原有的视频
		let stage = node.querySelector('.storey-box');
		stage.style.height = '486px';
		stage.innerHTML = '';
		// 插入新视频
		videos.forEach((video) => {
			let v = `<div class="spread-module"><a href="/video/av${video.aid}/" target="_blank"><div class="pic"><div class="lazy-img"><img src="${video.pic}@160w_100h.webp"></div></div><p title="${video.title}" class="t">${video.title}</p><p class="num"><span class="play"><i class="icon"></i>${video.stat.view}</span><span class="danmu"><i class="icon"></i>${video.stat.danmaku}</span></p></a></div>`;
			stage.innerHTML = stage.innerHTML + v;
		});
		// 插入页面
		let ref = document.querySelector('#chief_recommend');
		ref.insertAdjacentElement('afterend', node);
	}
}

// 当前是否首页？
if( UI.isIndex() ) {
	RECOMMAND.query(20);
	window._refreshGuessYouLike = RECOMMAND.query;
}
// 当前是否视频播放页？
// 如果是视频播放页，则获取当前视频的相关推荐视频
if( UI.isVideo() ) {
	let url = window.location.href,
		m = /\/av(\d+)\//.exec(url);
	if( m ) {
		let aid = m[1];
		DB.logUserViewHistory(aid);
		RECOMMAND.get(aid);
	} else {
		console.error(`找不到av号：${url}`);
	}
}