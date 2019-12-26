async function init_bili_van_framepreview(cover) {
    // 获取预览图
    const api = '//api.bilibili.com/pvideo?aid=';
    const raw = await HTTP.get(api + cover.dataset.aid);
    // 获取失败这种事不归我管，直接报错拉倒
    let r = null;
    try {
        r = JSON.parse(raw);
    } catch(e) {
        console.error(`${LOG_PREFIX} 获取视频预览失败`);
        console.error(raw);
        return false;
    }
    if( !r || r.code !== 0 ) {
        console.error(`${LOG_PREFIX} 视频预览返回值不正确`);
        console.error(r);
        return false;
    }
    const backgoundData = r.data;
    // 获取成功，创建van-framepreview
    const s = document.createElement('div');
    const f = document.createElement('div');
    const l = document.createElement('span');
    s.className = 'van-framepreview';
    s.style.backgroundImage = `url(${backgoundData.image[0]})`;
    s.style.opacity = 0;
    f.className = 'van-fpbar-box';
    f.append(l);
    s.append(f);
    // 绑定鼠标事件
    cover.addEventListener('mouseleave', () => {
        u = false;
        s.style.opacity = 0;
    });
    cover.addEventListener('mousemove', (evt) => {
        const e = evt.layerX,
              n = backgoundData.index.length,
              r = s.offsetWidth,
              i = Math.floor((e / r) * 100),
              a = r * backgoundData.img_x_len,
              c = Math.floor((e / r) * n),
              o = (backgoundData.img_y_size / backgoundData.img_x_size) * r,
              u = (-c % backgoundData.img_x_len) * r,
              f = -Math.floor(c / backgoundData.img_x_len) * o + 10;
        s.style.backgroundPosition = u + 'px ' + f + 'px';
        s.style.backgroundSize = a + 'px',
        l.style.width = i + '%';
        setTimeout(() => {
            s.style.opacity = 1;
        }, 1);
    });
    // 插入页面
    cover.append(s);
}

function bili_van_framepreview(cover) {
    cover.addEventListener('mouseenter', () => {
        init_bili_van_framepreview(cover);
    }, {
        once: true
    });
}