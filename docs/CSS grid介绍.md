
CSS Grid布局是一种强大并且富有创意的的布局方案，这篇文章专门为不了解Grid的web开发人员来介绍它，我将从以下几个方面来介绍它
1. 为什么需要Grid。Grid Line在生产环境中怎么安全的使用Grid
2. 介绍Gird基本概念。
3. 开始学习使用Gird。
3. 在生产环境中怎么安全的使用Grid。

## 1. 为什么需要Grid
目前我们有很多种布局方案，比如最初我们使用表格布局，后面使用float, position和inline-block来进行布局,由于这些方法在设计之初上并不是用于布局的，而是用于图文展示，由此CSS当初设计的不是很完美，并且遗漏了许多功能，比如说无法很方便的实现垂直居中;无法显式的去创建BFC，只能通过一些hack手段去处理，比如overflow: hidden, 或者使用clear:both去清除浮动带来的副作用。

2009年，W3C 提出了一种新的方案----`Flexbox` 布局,Flex 布局是轴线布局，只能指定"项目"针对轴线的位置，可以看作是一维布局，但是对于复杂的二维布局就有心无力了。
Grid布局是CSS诞生以来第一个专门为解决布局问题而生的方案,它将容器划分成"行"和"列"，产生单元格，然后指定"项目所在"的单元格，可以看作是二维布局。`Grid` 布局与 `Flex` 布局有一定的相似性，都可以指定容器内部多个项目的位置。但是，它们也存在重大区别,`Grid`主要是用于布局的，而`Flex`是主要用于内容的，两种方案并不是水火不容的，而是相辅相成的。

另外值得一提的一点是在栅格系统方案，我们也遇见过很多的CSS框架，例如`Bootstrap`和`Foundation`,它们都提供了很优秀的`grid layout`模板，但是它们本质上并不是`grid`，而是通过`float`来实现，`CSS grid`而跟他们是完全不同的。

web网页的布局基础是最初是基于`float`的，这导致了布局的模型是一维的，所以当我们去进行设计布局的时候都是从行去考虑方案的。下面是一个简单两列布局的实例，虽然看起来图片B下方似乎有一个列，但是实际上没有，我们都是通过行去进行布局操作的。

![1D layout](https://kano.guahao.cn/T2K300280788?token=ZDY3Zjc2ZWQ2NTIxZjhhMzFlNDIzNThkOTUxMDc0MmZfTUQ1COUSTOM&v=1.0)

相比之下`CSS Gird`布局，我们会通过以下图片所展示的方式来进行思考。

![2D layout](https://kano.guahao.cn/MGm300283331?token=Y2JlZDhmOTVkZmZkYmVkYzJkNWU1NGM0N2I0NjU2NjFfTUQ1COUSTOM&v=1.0)

在图中我们有`二维系统`,不单单只有行，其实还有列，这是一个全新的思考方式，类似于出现`React/Vue Hook`时候需要调整思考问题的方式, 接下来我会带你去理解它。


## 2. 介绍Gird基本概念。

在深入了解Grid的概念之前，重要的是了解术语，由于此处涉及的术语在概念上有点相似，因此，如果你不理解它们所代表的含义，就很容易将它们混淆。

### Grid Container

在元素上设置`display: grid`,能够使它成为一个`Grid Container`，它的直接子元素都将成为`grid Item`

```html
<style>
.container {
  display: grid;
}
</style>
<div class="container">
  <div class="item"></div>
  <div class="item"></div>
  <div class="item"></div>
</div>
```

### Grid Item
`grid container`的**直系子元素**，例如下列代码中的`item` 元素是 `grid item`，但是其中`sub-item`并不是`grid item`
```html
<style>
.container {
  display: grid;
}
</style>
<div class="container">
  <div class="item"></div>
  <div class="item">
    <p class="sub-item"></p>
  </div>
  <div class="item"></div>
</div>
```

### Grid Line

网格结构的分界线，它们可以是水平的，或者是垂直的，位于行或者列的任意一侧，在下图中黄线是一个列网格线。

![Grid Line](https://kano.guahao.cn/UQH307182395?token=ZjJmODA0MTk2M2JlY2UxMjczYjdmMWZkYmJhYzQ4OWFfTUQ1COUSTOM&v=1.0&resize=300:x)

### Grid Cell

两个相邻的行和两个相邻的列网格线之间的空间。 它是网格的单个“单位”。例如下图中黄色的单元格

![Grid Cell](https://kano.guahao.cn/3zy307183305?token=ZmNkODkzYThiZDM5ZWEzZGI3NjE4NDlkZTY5NjIxMmJfTUQ1COUSTOM&v=1.0&resize=300:x)

### Grid Area

一个网格区域可以包含多个单元格,例如下图中黄色区域。

![Grid Area](https://kano.guahao.cn/qaF307183232?token=NzFmNzVlMGU0NWFjNDM0NTdmODA3MTRhM2ZhMDFlOWJfTUQ1COUSTOM&v=1.0&resize=300:x)

## 3. 开始学习使用Gird

### grid-template-columns grid-template-rows
让我们从最基础的开始，下图是一个有3行6列的网格

![3*6](https://kano.guahao.cn/Y3o300292906?token=NzM1N2ZjNTU5ODVlMGRlODQwMzI3NDhkYWFkYjBkZjNfTUQ1COUSTOM&v=1.0&resize=300:x)

其中是4行`grid line` 和 7列 `grid line`，另外的两个`grid line`之前的区域叫做`grid area`，就在下图的橙色区域内，还有每个网格的单元格我们叫做`grid cell`，就如下图中的绿色区域。

![3*6v2](https://kano.guahao.cn/hB2300297210?token=NWJlNTVhOTRmMmI1ODc4NjYyY2YzOWEyZjZmYzczNGNfTUQ1COUSTOM&v=1.0&resize=300:x)

如果想要生成这样的布局很简单，我们只关注css，代码如下
```css
.grid {
  display: grid;
  grid-template-columns: 100px 100px 100px 100px 100px 100px;
  grid-template-rows: 100px 100px 100px;
}
```

首先我们要将容器从一个普通容器变成`grid`容器，接下来我们定义了每一行高度为100px，一共有3行，每一列宽度为100px，一共有6列。

你可以通过这个来查阅相关代码，在上面实例中有很多重复的100px，我们也可以改写成如下

```css
.grid {
  display: grid;
  grid-template-columns: repeat(6, 100px);
  grid-template-rows: repeat(3, 100px);
}
```

现在我们来给它加点边距，通过`grid-gap`来完成。
```css
.grid {
  display: grid;
  grid-template-columns: repeat(6, 100px);
  grid-template-rows: repeat(3, 100px);
  gap: 30px;
}
```

所以现在看起来如下
![3*6v3](https://kano.guahao.cn/DGD300298639?token=MjVkZTZmMzViYTk1N2E5MDU1Yjg4NmRiY2I2ZWZkMTlfTUQ1COUSTOM&v=1.0&resize=300:x)

当然你也可以可以给行和列的边距设置成不一样的，使用`grid-gap: 30px 10px;`来让行边距为30px，列边距为10px，这样就完成了一个简单的网格布局。

### grid-row grid-column

接下来我们来学习第二组属性`grid-row`和`grid-column`

在以下内容的预览图上大家会看到有各种辅助虚线，这个在真实渲染中是不存在的，使用过firebox的debug模式下才会显式出来，在这里我建议大家使用firefox去调试gird布局，这点chrome远远比不上firefox，希望chrome能够尽快跟进布局上的调试功能

```html
<style>
.container {
  display: grid;
  grid-template-columns: repeat(3, 100px);
  grid-template-rows: repeat(3, 100px);
}
.grid-item {
  background: red;
  grid-row: 2 / 3;
  grid-column: 2 / 3;
}
</style>
  <div class="container">
  <p class="grid-item">挂号网</p>
</div>
```

![grid](https://kano.guahao.cn/y6E307187044?token=ZDY2NjgzNDk3MzZiNjMyZjg3M2RkNGU4YmFmZDhkZWZfTUQ1COUSTOM&v=1.0&resize=300:x)

`grid-row`代表将这个`grid-item`设置在从第二根行线开始，到第三根行线结束，`grid-column`代表将这个`grid-item`设置在从第二根列线开始，到第三根列线结束,[示例代码点我](
https://codepen.io/afterthreeyears/pen/wvKLKrr)

到这里大家可能会觉得这里很惊艳，以往很麻烦的布局，`grid`确能够轻松做到。`grid`网格布局因为拥有独立行和列的系统，所以才能让我们**轻松定位/重新定位**内容。

接下来让我们继续来介绍`span`关键词，如果我们想要上图布局能够占满中间一行的三个格子，其中一个办法是设置`grid-column: 1 / 4`,代表从第一列线开始，一直到第四列线停止，这样如果觉得不好计算的话，可使用`span`关键字,`grid-column: 1 / span 3`,代表从第一个格子出发，穿过三个格子（包括出发的格子）为止，效果也是和上述一样的。

![span](https://kano.guahao.cn/PCf307188079?token=M2QwYzRhMmU3ZDQyZTQyZGUxZmNiMTAxMmNjNDI2YWZfTUQ1COUSTOM&v=1.0&resize=300:x)

[示例代码点我](https://codepen.io/afterthreeyears/pen/VwvJveY)

### grid-template-areas

然后我们来介绍一下`grid-template-areas`属性，我认为这是一个革命性的属性，能够以一种二维数组的方式来定位你的布局。

`grid-template-areas`属性接受一个或多个字符串作为值。 每个字符串（用引号引起来）代表网格的一行。 您可以在使用`grid-template-rows`和`grid-template-columns`定义的网格上使用该属性，也可以创建布局，在这种情况下，所有行都将自动调整大小

```css
.container {
  grid-template-areas: "one one two two"
                       "one one two two"
                       "three three four four"
                       "three three four four";
}
.one {
  grid-area: one;
}
.two {
  grid-area: two;
}
.three {
  grid-area: three;
}
.four {
  grid-area: four;
}
```
[示例代码点我](https://codepen.io/afterthreeyears/pen/JjYQYQX)

![grid-template-areas](https://kano.guahao.cn/DWV300322104?token=NzM4MDc5YWY3ZGRlZTRjYmVmNWU0OTA4ODg0OWJmYTFfTUQ1COUSTOM&v=1.0&resize=300:x)

其中要注意的是，**我们的网格区域一定要形成规整的矩形区域，什么L形，凹的或凸的形状都是不支持的**，会认为是无效的属性值,当然如果你不需要把全部网格填满那也是可以的，使用.号来进行占位

```css
.container {
  grid-template-areas: "one . two two"
                       "one . two two"
                       ". three four four"
                       ". three four four";
}
.one {
  grid-area: one;
}
.two {
  grid-area: two;
}
.three {
  grid-area: three;
}
.four {
  grid-area: four;
}
```

![area-placeholder](https://kano.guahao.cn/VML300322527?token=Y2QwNDQwZmI2MGUyN2YzMmRjMmIzZDdlODBhNmFhNWNfTUQ1COUSTOM&v=1.0&resize=300:x)

到目前为止我们已经简单的介绍了`grid`布局出现的前因后果和它核心的几个属性的基础语法，其中除了本文中介绍的几种语法外，还有另外的语法可以使用，但是由于这篇文章的主题是介绍`css grid`的使用方法，而不是每个api的详细介绍，这里不多赘述。

### 实战
经过以上的学习，我们来进行一个实战例子，以挂号网`www.guahao.com`的官网首屏来举例，我们可以把布局切分为4行3列。

![caniuse](https://kano.guahao.cn/Nd3307205695?token=N2YyNDZjOTM5OWRhODJkODc5MmVmZDZjOTllZmNkOWJfTUQ1COUSTOM&v=1.0&resize=600:x)

html结构定义如下
```html
<main>
  <img src="https://static.guahao.cn/front/portal-pc-static/img/new-wy-logo.png" alt="logo" class="logo" />
  <div class="search">
    <section class="searchBox">
      <input />
      <button>搜索</button>
    </section>
    <ul>
      <li>微医病友群</li>
      <li>千万助孕补贴</li>
      <li>治疗腋下多汗</li>
      <li>整形修复</li>
      <li>假体隆鼻</li>
      <li>脱发怎么办</li>
    </ul>
  </div>
  <img src="https://static.guahao.cn/front/portal-pc-static/img/2015/platform-logo-new.png" alt="guide" class="guide" />
  <div class="slider"></div>
  <div class="sub-project"></div>
  <img src="https://kano.guahao.cn/5gu296857515" alt="swiper" class="swiper">
  <div class="help"></div>
  <div class="news"></div>
</main>
```

能明显的看到与以往的布局不同，每一个区块都可以作为main标签的直接子元素，而不用去使用各种标签嵌套来布局, 接下里是容器的css代码。
```css
main {
  display: grid;
  grid-template-areas:
                    'logo search guide'
                    'slider sub-project sub-project'
                    'slider swiper help'
                    'slider news news';
  grid-template-columns: 240px 800px 240px;
  grid-template-rows: auto auto auto auto;
}
```
其中`grid-template-areas`一个属性就轻易定义了整个页面的布局结构，十分的方便，接下去通过给每一个子元素定义`grid-area`属性来指定放置的位置。
```css
.logo {
  grid-area: logo;
  width: 190px;
  align-self: center;
  justify-self: center;
}
.search {
  grid-area: search;
  align-self: center;
  justify-self: center;
}
/* more code */
```

[点击查看完整实例代码](https://codepen.io/afterthreeyears/pen/LYGbXMo)


## 4.在生产环境中怎么安全的使用Grid

![caniuse](https://kano.guahao.cn/WCb300314620?token=ZWFlMWMzZWQxZmZiMjYyMmNkNjc2NDU0ZDFjZGQwODVfTUQ1COUSTOM&v=1.0&resize=600:x)

截止目前为止，大量的现代浏览器已经支持`Grid`，截止2020年5月，大部分的高级浏览器都已经支持了`Grid`，并且对于不支持的我们可以通过[polyfill](https://github.com/FremyCompany/css-grid-polyfill/)进行兼容，另外你还可以通过`@supports`来查询浏览器是否支持`gird`布局，从而来决定是否使用`grid`

```css
@supports (display: grid) {
  .container {
    /* some css code */
  }
}
```

## 5. Grid属性表

| 作用在grid容器上 | 作用在grid子项上 |
| ---- | ---- |
| grid-template-columns | grid-column-start |
| grid-template-rows | grid-column-end |
| grid-template-areas | grid-row-start |
| grid-template | grid-row-end |
| column-gap | grid-column |
| row-gap | grid-row |
| gap | grid-area |
| justify-items | justify-self |
| align-items | align-self |
| place-items | place-self |
| justify-content | - |
| align-content | - |
| place-content | - |
| grid-auto-columns | - |
| grid-auto-rows | - |
| grid-auto-flow | - |
| grid | - |
