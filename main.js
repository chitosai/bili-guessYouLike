const LOG_PREFIX = '[哔哩哔哩猜你喜欢]';

const recommandMax = 12; // 一次获取几个推荐视频

const moduleTemplate = `
	<div class="bili-grid no-margin">
		<div class="bangumi-activity-area">
			<div class="area-header">
				<div class="left">
					<a id="猜你喜欢" class="the-world area-anchor" data-id="2233"></a>
					<svg class="icon">
						<use xlink:href="#channel-douga"></use>
					</svg>
					<a class="title">
						<span>猜你喜欢</span>
					</a>
				</div>
				<div class="right">
					<button class="primary-btn roll-btn">
						<svg style="transform: rotate(0deg);">
							<use xlink:href="#widget-roll"></use>
						</svg>
						<span>换一换</span>
					</button>
				</div>
			</div>
			<div class="bangumi-activity-body">
			</div>
		</div>
	</div>`;

// template string里用${}做标识是不是会直接被js转义掉。。我们就用!#{}来做标识好了
const videoCardTemplate = `
	<div class="bili-video-card">
		<div class="bili-video-card__skeleton hide">
			<div class="bili-video-card__skeleton--cover"></div>
			<div class="bili-video-card__skeleton--info">
				<div class="bili-video-card__skeleton--face"></div>
				<div class="bili-video-card__skeleton--right">
					<p class="bili-video-card__skeleton--text"></p>
					<p class="bili-video-card__skeleton--text short"></p>
					<p class="bili-video-card__skeleton--light"></p>
				</div>
			</div>
		</div>
		<div class="bili-video-card__wrap __scale-wrap">
			<a class="bili-video-card__ctnr" href="//www.bilibili.com/video/!#{bvid}" target="_blank">
				<div class="bili-video-card__image">
					<div class="bili-video-card__image--wrap">
						<picture class="v-img bili-video-card__cover">
							<img src="!#{cover}@672w_378h_1c_100q" alt="!#{title}">
						</picture>
						<div class="v-inline-player"></div>
					</div>
					<div class="bili-video-card__image--mask">
						<div class="bili-video-card__stats">
							<div class="bili-video-card__stats--left">
								<span class="bili-video-card__stats--item">
									<svg class="bili-video-card__stats--icon">
										<use xlink:href="#widget-play-count"></use>
									</svg>
									<span>!#{view}</span>
								</span>
								<span class="bili-video-card__stats--item">
									<svg class="bili-video-card__stats--icon">
										<use xlink:href="#widget-agree"></use>
									</svg>
									<span>!#{like}</span>
								</span>
							</div>
							<span class="bili-video-card__stats__duration">!#{duration}</span>
						</div>
					</div>
				</div>
				<div class="bili-video-card__info __scale-disable">
					<a href="//space.bilibili.com/!#{uid}" target="_blank">
						<div class="v-avatar bili-video-card__avatar">
							<picture class="v-img v-avatar__face">
								<img src="!#{avatar}@72w_72h" alt="!#{username}">
							</picture>
						</div>
					</a>
					<div class="bili-video-card__info--right">
						<a href="//www.bilibili.com/video/!#{bvid}" target="_blank">
							<h3 class="bili-video-card__info--tit" title="!#{title}">!#{title}</h3>
						</a>
						<p class="bili-video-card__info--bottom">
							<a class="bili-video-card__info--owner" href="//space.bilibili.com/!#{uid}" target="_blank">
								<span class="bili-video-card__info--author">!#{username}</span>
							</a>
						</p>
					</div>
				</div>
			</a>
		</div>
	</div>`;

// ajax
const HTTP = {
    get(url) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.onload = () => {
                if (xhr.status == 200) {
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
            if (typeof(key) == 'string') {
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
            DB.set({ count });
        });
    },
    logUserViewHistory(bvid) {
        DB.getUserViewHistory((history) => {
            // 判断浏览记录里是否已经包含这个bvid
            const exist = history.indexOf(bvid);
            if (exist > -1) {
                // 如果已存在，就把原有的那个访问记录删掉
                history.splice(exist, 1);
            }
            // 在队列末尾插入bvid
            history.unshift(bvid);
            // 保持访问记录最多99条
            if (history.length > 99) {
                const removedId = history.pop();
                // 删除这个bvid对应的推荐视频
                DB.get(removedId, (v) => {
                    DB.remove(removedId);
                    DB.recommandsCountAdd(-v.length);
                });
            }
            DB.set({ history });
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
            if (!videos) {
                // 没有获取过推荐视频要去服务端获取
                HTTP.get(`https://api.bilibili.com/x/web-interface/view/detail?bvid=${bvid}&aid=&jsonp=jsonp&callback=_`).then((_raw) => {
                    let raw = _raw.substring(2, _raw.length - 1);
                    let res;
                    try {
                        res = JSON.parse(raw);
                    } catch (e) {
                        return console.error(`${LOG_PREFIX} 解析detail接口返回值失败：${e}`);
                    }
                    if (res.code != 0) {
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
                let ids = [],
                    videos = [];
                while (ids.length < max) {
                    let i = Math.floor(Math.random() * allVideos.length);
                    const v = allVideos[i];
                    if (!ids.includes(v.bvid)) {
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
        if (path == '/' || path == '/index.html') {
            return true
        } else {
            return false;
        }
    },
    // 是否视频播放页
    isVideo() {
        let path = window.location.pathname;
        if (path.indexOf('video/BV') > -1) {
            return true;
        } else {
            return false;
        }
    },
    // 获取BVID
    getBVID() {
        let url = window.location.href,
            m = /\/BV(\w+)/.exec(url);
        if (m) {
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

            // 2022改版后几个模块彻底公共化了，连个标识id都没有了。那我们也别从页面里clone了，干脆自己用字符串创建元素吧
            const node = document.createElement('div');
            node.id = '_bili_guessyoulike';
            node.innerHTML = moduleTemplate;
            node.style.marginBottom = '50px';

            // 给「换一换」按钮绑定事件
            const changeBtn = node.querySelector('.primary-btn.roll-btn');
            // 点这个按钮就通知插件换一批推荐视频
            changeBtn.addEventListener('click', () => {
                window.postMessage({
                    type: 'UPDATE_RECOMMANDS'
                }, '*');
            });

            // 插入页面
            // 目前看来第一个<section class="bili-grid short-margin grid-anchor">是首屏的推荐模块，我们直接插在她下面就可以了
            const anchor = document.querySelector('.bili-grid.short-margin.grid-anchor');
            if (!anchor) {
                throw new Error(`${LOG_PREFIX} 无法定位首屏推荐模块 <section class="bili-grid short-margin grid-anchor">`)
            }
            anchor.insertAdjacentElement('afterEnd', node);
            UI.node = node;

            resolve();
        });
    },
    // 获取推荐模块的引用
    getRecommandNode() {
        return new Promise(async(resolve) => {
            // 检查是否有已插入的节点
            UI.node = document.querySelector('#_bili_guessyoulike');
            if (!UI.node) {
                // 没有就创建
                await UI.insertRecommands();
            }
            resolve();
        });
    },
    renderVideoCard(video) {
        function toWan(number) {
            return number > 9999 ? ((number / 10000).toFixed(1) + '万') : number;
        }

        function toMin(seconds) {
            return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
        }

        function toHttps(url) {
            return url.replace('http://', 'https://');
        }
        return videoCardTemplate.replaceAll('!#{bvid}', video.bvid)
            .replaceAll('!#{duration}', toMin(video.duration))
            .replaceAll('!#{title}', video.title)
            .replaceAll('!#{cover}', toHttps(video.pic))
            .replaceAll('!#{view}', toWan(video.stat.view))
            .replaceAll('!#{like}', toWan(video.stat.like))
            .replaceAll('!#{uid}', video.up.mid)
            .replaceAll('!#{avatar}', toHttps(video.up.face))
            .replaceAll('!#{username}', video.up.name)
    },
    async updateRecommands(videos) {
        await UI.getRecommandNode();
        const node = UI.node;
        const stage = node.querySelector('.bangumi-activity-body');
        if (videos.length) {
            // 生成视频卡片
            const videoCardsHTML = videos.map(video => UI.renderVideoCard(video)).join('');
            stage.innerHTML = videoCardsHTML;
        } else {
            stage.innerHTML = '<p style="color: #777; line-height: 360px; text-align: center; width: 100%;">观看记录为空，快去看几个视频吧~</p>';
        }
    },
    // 监听来自页面的更新请求
    listen() {
        window.addEventListener('message', (ev) => {
            if (ev.data.type && ev.data.type == 'UPDATE_RECOMMANDS') {
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
        if (bvid !== URLLISTENER.bvid) {
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
    if (UI.isIndex()) {
        RECOMMAND.recommand(recommandMax);
        UI.listen();
    }
    // 当前是否视频播放页？
    // 如果是视频播放页，则获取当前视频的相关推荐视频
    if (UI.isVideo()) {
        URLLISTENER.init();
    }
}

// 增加了bvid字段，需要清除以前的数据
DB.get('_20200325_clear_data', (cleared) => {
    if (cleared) {
        init();
    } else {
        chrome.storage.local.clear(() => {
            DB.set({ '_20200325_clear_data': true });
            init();
        });
    }
});