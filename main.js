let activeTab = null; // 当前tab

// database
const DB = {
	local: chrome.storage.local,
	get(key, cb) {
		DB.local.get(key, cb);
	},
	set(obj, cb) {
		DB.local.set(obj, cb)
	}
}

// 获取推荐
const RECOMMAND = {
	// 从服务端获取推荐视频数据
	update() {

	},
	// 从全部尚未观看的推荐视频里随机选出total个
	get(total) {

	},
	// 初始化推荐数据库，如果当前数据库不为空则不做任何事，如果为空就根据用户访问历史去获取推荐视频
	init() {
		
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
	RECOMMAND.init();
	UI.insertRecommand();
}
// 当前是否视频播放页？
// 如果是视频播放页，则获取当前视频的相关推荐视频
if( UI.isVideo() ) {
	RECOMMAND.update();
}