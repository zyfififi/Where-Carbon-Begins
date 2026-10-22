# 数据、代码与素材来源

## CEADs 数据

作品基于用户提供的2015—2022年八份《中国省级分部门碳排放清单》。公开数据入口：https://ceads.net.cn/data/carbon-inventory/provincial-level/emission-inventory/ 。仅提取 Urban / Rural 两个居民生活部门及17类燃料。各年源文件SHA-256及NOTE说明保存在 `data/history.js` 的 `meta.ceadsSources`。原始工作簿不应未经使用条款核验随公开作品重新打包。

数据 SHA-256：`43a9bb9bc42f2bd3188f3860beb48efadd6ecfc762236fa4835367bb7bee35cf`。

原始数据及文献权利归其各自权利人。用户已下载不等于已取得公开再分发或任意商用授权；正式参赛、公开部署与再分发前需检查 CEADs 最新使用和引用规则。派生结果同样须保留出处。方法参考：

- Shan et al. (2018), China CO₂ emission accounts 1997–2015. https://doi.org/10.1038/sdata.2017.201
- Shan et al. (2020), China CO₂ emission accounts 2016–2017. https://doi.org/10.1038/s41597-020-0393-y
- Xu et al. (2024), China carbon emission accounts 2020–2021. https://www.sciencedirect.com/science/article/pii/S0306261924002204

## 国家统计局人口数据

用户从国家统计局国家数据导出的31份“省级地区年度数据”工作簿，表内注明来源为国家统计局，入口 https://data.stats.gov.cn/ 。原文件年份2016—2025，指标为年末常住人口、城镇人口和乡村人口，单位万人。仅匹配CEADs共同覆盖的30省、2016—2022年。人口文件指纹、原表行号与年份保存在 `data/history.js` 的 `meta.populationSources`。

人口归一结果是本项目派生近似值，不是统计局发布的居民碳足迹。原值保留舍入差，未调整、未插值，2015缺人口。公开发布前须核验来源使用规则并保留出处。

## Apache ECharts

- `vendor/echarts.min.js`，版本 5.5.1。ASF Apache ECharts 项目：https://echarts.apache.org/ 。
- 第三方依赖从本机已存在的发行文件复制，保留文件内 ASF 许可头与第三方声明；不作为作者原创代码。
- Apache License, Version 2.0：https://www.apache.org/licenses/LICENSE-2.0 。保留官方 5.5.1 tag 的 `vendor/LICENSE`、`vendor/NOTICE`（从 https://github.com/apache/echarts/tree/5.5.1 下载）与 `vendor/LICENSE-2.0.txt`。
- Copyright 2017–2024 The Apache Software Foundation.

文件还包含 Microsoft TypeScript helper 的许可声明，已保留在发行文件中。

## ECharts GL

- `vendor/echarts-gl.min.js`，固定版本 2.0.9；兼容本项目 ECharts 5.5.1。
- 来源：https://registry.npmjs.org/echarts-gl/-/echarts-gl-2.0.9.tgz ，上游项目：https://github.com/ecomfe/echarts-gl 。
- BSD 3-Clause License，Copyright (c) 2017, Baidu Inc.。完整许可证保留于 `vendor/echarts-gl.LICENSE`。该依赖及内含第三方代码不是本作品的原创实现。
- 无需运行时请求 CDN；WebGL 负责真实三维柱体、相机和光照。

## 中国省级边界素材

- `vendor/china-map.js` 的边界来源：阿里云 DataV，https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json 。
- 使用用户本机已有的第三方原始 GeoJSON 副本，不采用 DeepSeek 的页面程序或派生排放数据。原始 GeoJSON SHA-256：`99adfeded5223848bbe37a0a12f8023e11ee12161c7800521c27db42fdeac275`。
- 前版 `c1/scripts/prepare_map.py` 只规范 34 个省级名称供数据关联，并给边界线要素设置内部标识；保留原始全部几何坐标和要素。此版本复用其本地 JS 包装，以支持断网及 file:// 浏览。
- 不把边界素材认领为原创，也不假定 ECharts 的 Apache-2.0 许可覆盖地图素材。尚未核验该边界的再分发许可、审图号或公开使用资格；正式参赛或公开发布前需核验授权及适用的地图管理/审图要求，并在必要时替换为满足要求的地图资源。本地功能完成不等于完成公开发布合规审核。

## 页面与图形

`index.html`、`styles.css`、`site.css`、`app.js`、`analysis.js`、`routes.js`、`carbon-3d.js`、数据处理与版式由本目录独立设计实现。第二版参考 DeepSeek 版本的地图入口思路，但不复制其作品代码和派生数据；复用的第三方 ECharts 和地图素材如上单列。采用系统字体，无嵌入字体文件。无第三方图片、图标或商业模板。封面轨道是艺术化图形，不是 CO₂ 分子或电子运动的科学模型。

## AI 协作披露

本项目由学生提出问题、选择范围并负责数据解释和验收，Codex 辅助完成设计与程序实现。最终课程或竞赛材料应如实记录实际提示、迭代、人工修改和实质性贡献，不能仅凭本说明声称所有内容由人工编写。DeepSeek 的版本位于独立目录，本目录未复制其作品代码与派生数据。
