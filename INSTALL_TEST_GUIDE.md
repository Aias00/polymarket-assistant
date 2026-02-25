# Polymarket Chrome 插件 - 安装测试指南

## 📋 安装前检查

✅ **已完成的准备工作**：
- manifest.json 格式验证通过
- 数据文件完整（7 个 Speaker, 22 个关键词）
- 所有代码文件已创建
- 图标文件已生成

---

## 🔧 安装步骤（5 分钟）

### 步骤 1：打开 Chrome 扩展管理页面
```
1. 打开 Chrome 浏览器
2. 在地址栏输入：chrome://extensions/
3. 按回车键
```

### 步骤 2：启用开发者模式
```
在扩展管理页面右上角，找到"开发者模式"开关，打开它
```

### 步骤 3：加载插件
```
1. 点击左上角"加载已解压的扩展程序"按钮
2. 在弹出的文件选择器中，导航到：
   ~/Projects/polymarket-assistant
3. 点击"选择"按钮
```

### 步骤 4：验证安装成功
```
✅ 在扩展列表中看到"Polymarket Strategy Assistant"
✅ 扩展状态显示"已启用"
✅ 看到紫色图标（三个尺寸：16/48/128）
```

---

## 🧪 测试步骤

### 测试 1：基本功能测试

**测试 Base Rate 显示器**：
```
1. 打开新标签页
2. 访问：https://polymarket.com
3. 搜索包含 Speaker 的市场，例如：
   - "Trump crypto"
   - "Powell recession"
   - "Musk Tesla"

4. 打开市场页面
5. 查看右侧或底部是否出现 "📊 Base Rate Analysis" widget
```

**预期结果**：
- ✅ 看到 Base Rate 分析 widget
- ✅ 显示 Speaker 名称
- ✅ 显示关键词
- ✅ 显示历史概率
- ✅ 显示概率差额
- ✅ 提供交易建议

### 测试 2：策略筛选器测试

**测试首页筛选功能**：
```
1. 访问 Polymarket 首页：https://polymarket.com
2. 查看顶部是否有"🔍 Strategy Filter"工具栏
3. 勾选筛选条件：
   ☑ Market Gap ≥ 15%
   ☑ Speaker Markets
   ☐ High Liquidity
4. 点击"Apply Filter"
```

**预期结果**：
- ✅ 显示筛选工具栏
- ✅ 可以勾选筛选条件
- ✅ 点击 Apply 后过滤市场
- ✅ 显示匹配的市场数量

### 测试 3：风险管理测试

**测试钱包页面监控**：
```
1. 访问 Polymarket 钱包页面：
   https://polymarket.com/portfolio
2. 查看是否出现"💰 Portfolio Risk Dashboard"
```

**预期结果**：
- ✅ 显示总余额
- ✅ 显示风险敞口
- ✅ 显示持仓列表
- ✅ 风险警告（如果超过阈值）

### 测试 4：Popup 测试

**测试扩展弹窗**：
```
1. 点击 Chrome 工具栏中的扩展图标（紫色图标）
2. 查看弹窗界面
```

**预期结果**：
- ✅ 弹窗正常打开
- ✅ 显示扩展名称和版本
- ✅ 显示功能开关或设置

---

## 🔍 调试方法

### 查看控制台日志

**Content Script 日志**：
```
1. 在 Polymarket 页面右键 → 检查
2. 打开 Console 标签
3. 查找日志前缀：[Polymarket Assistant]
```

**Background Script 日志**：
```
1. 访问：chrome://extensions/
2. 找到 Polymarket Strategy Assistant
3. 点击"service worker"链接
4. 查看 DevTools Console
```

### 常见问题排查

**问题 1：Widget 不显示**
- 检查是否在 Polymarket 页面
- 检查 Console 是否有错误
- 刷新页面重试

**问题 2：数据加载失败**
- 检查 data/speakers.json 文件是否存在
- 查看 Console 是否有 CORS 错误
- 确认 manifest.json 中 web_accessible_resources 配置正确

**问题 3：样式异常**
- 检查 Shadow DOM 是否正确创建
- 查看 content/styles.css 是否加载

---

## 📊 测试数据

**已包含的 Speaker 数据**：
- Donald Trump（4 个关键词：crypto, bitcoin, tariff, wall）
- Jerome Powell（4 个关键词：recession, inflation, rate, cut）
- Elon Musk（4 个关键词：Tesla, Mars, Twitter, AI）
- Joe Biden（3 个关键词：climate, tax, healthcare）
- Narendra Modi（2 个关键词：India, economy）
- Vladimir Putin（3 个关键词：Ukraine, NATO, war）
- Kim Jong Un（2 个关键词：missile, nuclear）

---

## ✅ 安装成功标志

如果看到以下内容，说明插件安装成功：

1. ✅ Chrome 扩展列表中出现"Polymarket Strategy Assistant"
2. ✅ 扩展图标显示正常（紫色）
3. ✅ 访问 Polymarket 页面时 Console 有加载日志
4. ✅ Speaker 市场页面出现 Base Rate widget

---

## 🐛 如果遇到问题

**快速修复**：
```
1. 移除扩展重新加载
2. 清除浏览器缓存
3. 检查 Chrome 版本（需要 >= 88）
4. 查看 Console 错误日志
```

**报告问题**：
- 截图错误信息
- 提供 Console 日志
- 描述复现步骤

---

**安装完成后，告诉我测试结果，我可以帮你进一步优化！** 🚀
