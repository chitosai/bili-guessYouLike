function init() {
	// 浏览记录
	chrome.storage.local.get('history', (data) => {
		document.querySelector('#historyCount').textContent = data['history'] ? data['history'].length : 0;
	});

	// 总视频数
	chrome.storage.local.get('count', (data) => {
		document.querySelector('#videosCount').textContent = data['count'] || 0;
	});

	// 数据大小
	chrome.storage.local.getBytesInUse(null, (bytes) => {
		let d = 0;
		if( bytes < 1048576 ) {
			d = ( (bytes / 1024).toFixed(1) + 'KB');
		} else {
			d = ( (bytes / 1048576).toFixed(1) + 'MB');
		}
		document.querySelector('#storageUsage').textContent = d;
	});
}

init();

document.querySelector('#clearStorage').addEventListener('click', () => {
	chrome.storage.local.clear(() => {
		init();
	});
});