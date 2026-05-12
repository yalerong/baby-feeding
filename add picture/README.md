# add picture

这个文件夹提供了“给喂养记录添加图片”的可复用代码，按需拷贝到现有项目即可。

## 1) 已提供内容

- `components/photo-uploader/`：图片上传组件（最多 3 张，支持相册/拍照、预览、删除）

## 2) 如何接入 `pages/add`

### 第一步：注册组件

在 `pages/add/add.json` 增加：

```json
{
  "usingComponents": {
    "photo-uploader": "/add picture/components/photo-uploader/photo-uploader"
  }
}
```

### 第二步：在页面 data 增加字段

在 `pages/add/add.js` 的 `data` 内增加：

```js
images: []
```

并新增方法：

```js
onImagesChange(e) {
  this.setData({
    images: e.detail.images || []
  })
}
```

### 第三步：在 `pages/add/add.wxml` 使用组件

把以下内容放在表单卡片下方（例如预览卡片前后都可以）：

```xml
<photo-uploader
  initialImages="{{images}}"
  maxCount="{{3}}"
  bind:change="onImagesChange"
/>
```

### 第四步：提交时把图片写入数据库

在 `pages/add/add.js` 的 `payload` 中增加：

```js
images: this.data.images
```

## 3) 云函数需要同步字段（最小改造）

### `cloudfunctions/addRecord/index.js`

从 event 解构出 `images`，并在 `data` 中写入：

```js
images: Array.isArray(images) ? images : []
```

### `cloudfunctions/updateRecord/index.js`

同样把 `images` 一起更新，避免编辑时把图片丢失。

### `cloudfunctions/getRecords/index.js`

通常不需要改；只要查询的是整条记录，`images` 会自动返回。

## 4) 可选增强

- 上传前调用 `wx.compressImage` 再上传，进一步降低流量
- 删除图片时用 `wx.cloud.deleteFile` 清理云存储，避免累计占用
- 首页历史列表显示 1 张缩略图，点击看大图
