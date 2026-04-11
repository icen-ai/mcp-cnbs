# GitHub Actions 自动发布配置

## 功能说明

此 GitHub Actions 工作流会在推送 `x.x.x` 格式的 tag 时自动：

1. 从 tag 中提取版本号
2. 自动更新 package.json 中的版本号
3. 构建项目
4. 发布带命名空间的包 (`@icen.ai/mcp-cnbs`)
5. 发布不带命名空间的包 (`mcp-cnbs`)

## 配置步骤

### 1. 设置 npm 访问令牌

1. 登录 [npm 账户](https://www.npmjs.com/)
2. 进入 **Account Settings** → **Tokens**
3. 生成一个 **Automation** 类型的令牌
4. 复制令牌值

### 2. 在 GitHub 仓库中添加令牌

1. 进入 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 添加新的 secret：
   - Name: `NPM_TOKEN`
   - Value: 你的 npm 访问令牌

### 3. 使用方法

#### 推送标签触发发布

```bash
# 推送 x.x.x 格式的标签
git tag 1.0.3
git push origin 1.0.3
```

#### 工作流执行流程

1. **检查代码**：克隆仓库代码
2. **设置 Node.js**：使用 Node.js 18
3. **安装依赖**：运行 `npm ci`
4. **构建项目**：运行 `npm run build`
5. **提取版本**：从 tag 中提取版本号
6. **更新版本**：自动更新 package.json 中的版本号
7. **发布 scoped 包**：发布 `@icen.ai/mcp-cnbs`
8. **发布 unscoped 包**：发布 `mcp-cnbs`

### 4. 版本管理

- **标签格式**：必须是 `x.x.x` 格式（如 `1.0.0`、`2.1.3`）
- **版本更新**：工作流会自动从 tag 中提取版本号并更新 package.json
- **发布顺序**：先发布 scoped 包，再发布 unscoped 包

### 5. 查看构建状态

在 GitHub 仓库的 **Actions** 标签页查看构建状态和详细日志。

## 注意事项

1. **权限**：确保 npm 令牌有发布权限
2. **依赖**：确保 `package.json` 中有 `build` 脚本
3. **错误处理**：如果发布失败，会在 Actions 日志中显示详细错误信息
4. **版本冲突**：确保 tag 版本号不与已发布的版本冲突

## 示例

```bash
# 发布版本 1.0.4
git tag 1.0.4
git push origin 1.0.4

# 发布版本 2.0.0
git tag 2.0.0
git push origin 2.0.0
```

这样就实现了在 GitHub 推送 tag 时自动发布到带命名空间和不带命名空间的包！