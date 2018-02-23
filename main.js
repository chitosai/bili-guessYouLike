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
		DB.local.get(key, cb);
	},
	set(obj, cb) {
		DB.local.set(obj, cb);
	},
	isVideoAlreadyFetched(aid) {
		return new Promise((resolve, reject) => {
			DB.get('fetchedAids', (fetchedAids) => {
				if( !fetchedAids ) {
					return false;
				} else if( fetchedAids.includes(aid) ) {
					resolve();
				} else {
					reject();
				}
			});
		});
	},
	videoFetched(aid) {
		DB.get('fetchedAids', (fetchedAids) => {
			if( !fetchedAids ) {
				fetchedAids = [aid];
			} else {
				fetchedAids.push(aid);
				if( fetchedAids.length > 99 ) {
					fetchedAids.shift();
				}
			}
			DB.set({
				fetchedAids: fetchedAids
			});
		});
	},
	saveRecommands(aid, videos) {
		let obj = {};
		obj[aid] = videos;
		DB.set(obj);
		DB.videoFetched(aid);
	},
	getUserViewHistory() {
		let data = window.localStorage.getItem('biliHistoryData');
		if( !data ) {
			return [];
		}
		data = JSON.parse(data);
		// 去重
		let uniques = [];
		for( let i = 0; i < data.length; i++ ) {
			if( uniques.includes(data[i].aid) ) {
				data.splice(i--, 1);
			} else {
				uniques.push(data[i].aid);
			}
		}
		return data;
	}
}

// 获取推荐
const RECOMMAND = {
	// 获取当前页面的推荐视频
	update() {
		let url = window.location.href,
				m = /\/av(\d+)\//.exec(url);
		if( !m ) {
			return console.error(`找不到av号：${url}`);
		}
		RECOMMAND.get(m[1]);
	},
	// 获取av号对应的推荐视频
	get(aid) {
		DB.isVideoAlreadyFetched(aid).then(() => {
			// 已经获取过就不用再获取了
		}).catch(() => {
			// 没有获取过推荐视频要去服务端获取
			HTTP.get(`https://comment.bilibili.com/recommendnew,${av}`).then((raw) => {
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
				DB.saveRecommands(aid, data);
			});
		});
	},
	// 立即根据当前的用户观看记录生成新的推荐列表
	prepare() {
		let vh = DB.getUserViewHistory();
		let max = Math.min(12, vh.length); // 只根据最近观看的12个视频来生成推荐
		let recommandsAll = [];
		for( let i = 0; i < max; i++ ) {
			let v = vh[i];
			let videos = DB.get(v.aid);
			if( !videos.length ) {
				RECOMMAND.get(v.aid);
			}
			recommandsAll = recommandsAll.concat(videos);
		}
		let obj = {
			videos: recommandsAll
		};
		DB.set(obj);
	},
	// 根据当前用户访问记录获取n个随机推荐视频
	query(n) {
		let videos = DB.get('videos');
		videos.random = (n) => {
			let array = this, max = Math.min(array.length, n);
			let ids = [], items = [];
			do {
				let i = Math.floor(Math.random() * array.length);
				if( !ids.includes(i) ) {
					ids.push(i);
					items.push(array[i]);
				}
			} while( ids.length < max );
			return items;
		}
		return videos.random(n);
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
	insertRecommand() {
		let videos = RECOMMAND.query(20);
		console.log(videos)
		return true;
	}
}

// 当前是否首页？
if( UI.isIndex() ) {
	RECOMMAND.get();
	UI.insertRecommand();
}
// 当前是否视频播放页？
// 如果是视频播放页，则获取当前视频的相关推荐视频
if( UI.isVideo() ) {
	RECOMMAND.update();
}