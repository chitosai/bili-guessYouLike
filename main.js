let activeTab = null; // 当前tab

// database
const DB = {
	local: chrome.storage.local,
	get(key, cb) {
		DB.local.get(key, cb);
	},
	set(obj, cb) {
		DB.local.set(obj, cb)
	},
	getViewHistory() {
		let data = window.localStorage.getItem('biliHistoryData');
		if( !data ) {
			return [];
		}
		return JSON.parse(data);
	}
}

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

// 获取推荐
const RECOMMAND = {
	// 从服务端获取当前视频页的推荐视频
	update() {
		let url = window.location.href,
				m = /\/av(\d+)\//.exec(url);
		if( !m ) {
			return console.error(`找不到av号：${url}`);
		}
		let av = m[1];
		HTTP.get(`https://comment.bilibili.com/recommendnew,${av}`).then((raw) => {
			let res;
			try {
				res = JSON.parse(raw);
			} catch(e) {
				return console.error(`解析recommandnew接口返回值失败：${e}`);
			}
			let data = res.data;
			// 已推荐次数、本次操作执行的时间戳
			data.forEach((v) => {
				v._count = 0,
				v._ts = new Date();
			});
			// 保存到数据库
			let d = {};
			d[av] = data;
			DB.set(d);
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
	insertRecommand() {
		return true;
	}
}

// 当前是否首页？
if( UI.isIndex() ) {
	RECOMMAND.update();
	UI.insertRecommand();
}
// 当前是否视频播放页？
// 如果是视频播放页，则获取当前视频的相关推荐视频
if( UI.isVideo() ) {
	RECOMMAND.update();
}