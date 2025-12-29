---
title: Git 多人协作开发常见问题与解决方案模板
pinned: false
description: 多人协作开发时，Git 使用不当很容易踩坑：冲突解决不了、误删别人代码、提交历史乱成一团等等等。所以今天为佬们整理了团队开发中最常遇到的问题和实战解决方案。
tags: [Git, 文档]
category: 技术
author: therainisme
draft: false
# updated: 20-10-10
published: 2025-12-27
image: "api"
---

**本文转载自[Linux.Do](https://linux.do/t/topic/1359887)，查看原文以获得更好的体验。**

## 场景一：代码冲突了怎么办？

多人同时修改同一个文件，`git pull` 或 `git merge` 时就会遇到冲突。这是团队开发中最常见的问题。

### 情况 1：Pull 时发生冲突

当你执行 `git pull` 时提示冲突：

```bash
$ git pull
Auto-merging src/utils.js
CONFLICT (content): Merge conflict in src/utils.js
Automatic merge failed; fix conflicts and then commit the result.
```

**解决步骤：**

1. **查看冲突文件**

```bash
git status
```

标记为 `both modified` 的文件就是冲突文件。

2. **打开冲突文件，手动解决冲突**

冲突部分会被标记出来：

```javascript
<<<<<<< HEAD
function calculate(a, b) {
return a + b;
}
=======
function calculate(x, y) {
return x * y;
}
>>>>>>> origin/main
```

- `<<<<<<< HEAD` 到 `=======` 之间是你的本地修改

- `=======` 到 `>>>>>>> origin/main` 之间是远程的修改

手动编辑，保留需要的代码，删除标记符号。

3. **标记冲突已解决，提交**

```bash
git add src/utils.js
git commit -m "解决冲突：合并 calculate 函数"
git push
```

### 情况 2：想放弃本地修改，直接用远程的

```bash
# 放弃合并，回到冲突前的状态
git merge --abort

# 强制用远程覆盖本地
git fetch origin
git reset --hard origin/main
```

**注意：** `reset --hard` 会丢失本地所有未提交的修改，慎用！

### 情况 3：想保留本地修改，放弃远程的

```bash
# 放弃合并
git merge --abort

# 强制推送本地到远程（会覆盖远程，务必和团队沟通！）
git push -f origin main
```

## 场景二：不小心在 main 分支上开发了

正确的做法是从 `main` 拉出 `feature` 分支开发，但有时忘记切换分支，直接在 `main` 上写了一堆代码。

### 解决方案：将修改转移到新分支

**情况 1：还没有 commit**

```bash
# 将当前修改暂存
git stash

# 切换到 main，确保是最新的
git checkout main
git pull

# 创建新分支
git checkout -b feature/new-feature

# 恢复刚才的修改
git stash pop
```

**情况 2：已经 commit，但还没 push**

```bash
# 创建新分支（会把当前的 commit 带过去）
git checkout -b feature/new-feature

# 切回 main，回退到之前的状态
git checkout main
git reset --hard origin/main
```

**情况 3：已经 commit 并且 push 了**

这种情况比较棘手，最好和团队沟通，让其他人暂时不要 pull。然后：

```bash
# 创建新分支保存修改
git checkout -b feature/new-feature
git push origin feature/new-feature

# 回到 main，回退到远程的历史
git checkout main
git reset --hard origin/main~1 # 回退到上一个 commit

# 强制推送（需要和团队确认）
git push -f origin main
```

## 场景三：团队成员的代码把我本地的覆盖了

这通常是因为直接 `git pull` 导致自动合并，且别人的代码和你的有冲突，Git 自动选择了对方的版本。

### 预防方法：使用 rebase 而不是 merge

```bash
# 不要直接 git pull
# 推荐使用以下方式

# 先获取远程更新
git fetch origin

# 查看远程和本地的差异
git log HEAD..origin/main --oneline

# 使用 rebase 合并（让提交历史更清晰）
git rebase origin/main
```

**`git pull` vs `git pull --rebase` 的区别：**

- `git pull` = `git fetch` + `git merge`（会产生合并提交，历史会分叉）

- `git pull --rebase` = `git fetch` + `git rebase`（保持线性历史，更清晰）

建议配置 rebase 为默认行为：

```bash
git config --global pull.rebase true
```

### 如果代码已经被覆盖，怎么找回？

Git 的 reflog 记录了所有操作，可以找回丢失的提交：

```bash
# 查看所有操作记录
git reflog

# 找到丢失代码的 commit，比如 abc1234
git checkout abc1234

# 查看这次提交的内容
git show abc1234

# 恢复到这个提交
git reset --hard abc1234
```

## 场景四：想撤销已经 push 的错误提交

### 情况 1：撤销最近一次提交（推荐方式）

```bash
# 创建一个新提交来撤销之前的修改（不改变历史）
git revert HEAD
git push
```

这是最安全的方式，适合已经被别人 pull 的提交。

### 情况 2：强制回退（需团队协调）

如果提交刚推送，还没人 pull：

```bash
# 回退到上一个提交
git reset --hard HEAD^

# 强制推送
git push -f origin main
```

**注意：** 如果别人已经 pull 了你的提交，强制推送会导致其他人的仓库出问题。

### 情况 3：只撤销某个历史提交

```bash
# 撤销指定的 commit
git revert <commit-id>

# 撤销多个连续的 commit
git revert <start-commit>..<end-commit>
```

## 场景五：Feature 分支开发了很久，main 已经更新很多了

Feature 分支长期开发，main 分支已经合并了很多其他人的代码，如何同步？

### 方法 1：Merge main 到 feature（会产生合并提交）

```bash
git checkout feature/my-feature
git merge main
```

优点：操作简单，保留完整历史。

缺点：会产生一个合并提交，历史图会有分叉。

### 方法 2：Rebase 到 main 上（保持线性历史）

```bash
git checkout feature/my-feature
git rebase main
```

优点：提交历史干净，呈线性。

缺点：如果冲突多，解决起来比较麻烦。

**如果 rebase 过程中出现冲突：**

```bash
# 解决冲突后
git add .
git rebase --continue

# 如果想放弃 rebase
git rebase --abort
```

**注意：** 如果 feature 分支已经 push 过，rebase 后需要强制推送：

```bash
git push -f origin feature/my-feature
```

## 场景六：合并分支时想保留完整的提交记录

有时候 Feature 分支合并到 main 时，Git 会自动使用 Fast-forward，导致 Feature 分支的多个 commit 直接接到 main 上，不太清晰。

### 使用 `--no-ff` 保留分支信息

```bash
git checkout main
git merge --no-ff feature/my-feature -m "合并功能：用户登录"
```

这样会强制创建一个合并提交，保留分支的完整信息。

### 使用 Squash 合并（将多个提交压缩成一个）

如果 Feature 分支有很多琐碎的提交，可以压缩成一个：

```bash
git checkout main
git merge --squash feature/my-feature
git commit -m "新增：用户登录功能"
```

这样 main 分支只会有一个清晰的提交记录。

## 场景七：团队成员强制推送，导致我的代码丢失

如果有人执行了 `git push -f`，会改写远程历史，导致其他人的本地仓库和远程不一致。

### 症状

执行 `git pull` 时报错：

```
fatal: refusing to merge unrelated histories
```

或者提示本地和远程的历史分叉了。

### 解决方法

```bash
# 方法 1：强制同步远程（会丢失本地未推送的修改）
git fetch origin
git reset --hard origin/main

# 方法 2：如果本地有重要修改，先备份
git checkout -b backup-branch # 创建备份分支
git checkout main
git reset --hard origin/main
```

**团队规范建议：**

- 禁止在 `main`/`master` 等主分支上使用 `git push -f`

- 可以在 GitHub/GitLab 上设置分支保护，禁止强制推送

## 场景八：提交历史太乱，想整理一下

多人协作时，提交历史容易变成：

```
fix typo
fix again
final fix
fix for real this time
```

这种情况可以用 `rebase -i` 整理。

### 交互式 Rebase

```bash
# 整理最近 5 个提交
git rebase -i HEAD~5
```

会打开编辑器，显示类似内容：

```
pick abc1234 添加登录功能
pick def5678 fix typo
pick ghi9012 fix again
pick jkl3456 优化性能
pick mno7890 fix for real
```

修改为：

```
pick abc1234 添加登录功能
squash def5678 fix typo
squash ghi9012 fix again
pick jkl3456 优化性能
squash mno7890 fix for real
```

保存后，Git 会把标记为 `squash` 的提交合并到前一个 `pick` 的提交中。

**常用操作：**

- `pick`：保留这个提交

- `squash`：合并到上一个提交

- `reword`：修改提交信息

- `drop`：删除这个提交

**注意：** 只对还没 push 的提交使用，否则需要 `push -f`。

## 场景九：想查看某个同事改了什么

### 查看某次提交的修改

```bash
# 查看某个 commit 的详细修改
git show <commit-id>

# 只看改了哪些文件
git show --name-only <commit-id>

# 查看某个文件的修改历史
git log -p <文件名>
```

### 查看两个分支的差异

```bash
# 查看 feature 分支和 main 的差异
git diff main..feature/new-feature

# 只看改了哪些文件
git diff --name-only main..feature/new-feature

# 查看某个同事的所有提交
git log --author="张三"
```

### 查看某个文件每一行是谁改的

```bash
git blame <文件名>
```

会显示每一行代码最后是谁在哪次提交中修改的。

## 场景十：协作时的最佳实践

### 1. 提交前先 Pull

```bash
# 开发前
git checkout main
git pull

# 创建 feature 分支
git checkout -b feature/new-feature

# 开发完成后，提交前先同步 main
git checkout main
git pull
git checkout feature/new-feature
git rebase main

# 推送
git push origin feature/new-feature
```

### 2. 提交信息要清晰

不好的提交信息：

```
fix bug
update
修改
```

好的提交信息：

```
修复：修复用户登录时 Token 过期的问题
新增：添加用户头像上传功能
优化：优化首页查询性能，减少 SQL 查询次数
```

推荐格式：`类型：简短描述`

常见类型：

- `新增` / `feat`：新功能

- `修复` / `fix`：Bug 修复

- `优化` / `refactor`：重构

- `文档` / `docs`：文档修改

- `测试` / `test`：测试相关

### 3. 小步提交，频繁推送

不要攒一堆修改再提交，建议每完成一个小功能就提交：

```bash
git add .
git commit -m "新增：用户注册表单验证"
git push
```

好处：

- 代码审查更容易

- 出问题时容易回滚

- 减少冲突的可能性

### 4. Feature 分支命名规范

```bash
feature/login-page # 新功能
bugfix/user-avatar # Bug 修复
hotfix/critical-bug # 紧急修复
refactor/api-structure # 重构
```

### 5. 不要提交敏感信息

`.env`、`config.json`、密钥文件等不要提交到仓库。

在 `.gitignore` 中添加：

```
.env
.env.local
config.json
*.key
*.pem
node_modules/
```

如果不小心提交了，立即删除：

```bash
# 从 Git 历史中彻底删除
git filter-branch --force --index-filter \
"git rm --cached --ignore-unmatch .env" \
--prune-empty --tag-name-filter cat -- --all

# 强制推送
git push -f origin --all
```

## 常见问题

### 1. `git pull` 时总是产生 Merge commit，很烦

配置为 rebase 模式：

```bash
git config --global pull.rebase true
```

### 2. 如何防止误推送到 main 分支？

在 `.git/hooks/pre-push` 中添加保护脚本，或者在 GitHub/GitLab 上启用分支保护。

### 3. 团队成员的 Git 版本不一致，会有问题吗？

建议团队统一使用较新的 Git 版本（>= 2.30），避免命令不一致。

### 4. 如何处理二进制文件冲突（如图片）？

二进制文件无法自动合并，只能选择一个版本：

```bash
# 使用本地版本
git checkout --ours <文件名>

# 使用远程版本
git checkout --theirs <文件名>
git add <文件名>
git commit

```

### 5. Merge 和 Rebase 到底有什么区别？

这是多人协作中最容易混淆的概念。简单来说：**Merge 保留完整历史但会产生分叉，Rebase 改写历史让提交呈线性。**

#### Merge 的工作方式

假设你在 `feature` 分支开发，同时 `main` 分支也有新的提交：

```
# 初始状态：从 B 创建了 feature 分支
    A---B  main
         \
          C---D  feature

# main 分支继续有新提交
          C---D  feature
         /
    A---B---E---F  main

# 在 feature 分支执行: git merge main
          C---D-------G  feature
         /           /
    A---B---E---F---/  main

```

会创建一个新的合并提交 `G`，它有两个父提交（`D` 和 `F`），保留了两条分支的完整历史。

#### Rebase 的工作方式

同样的场景，在 `feature` 分支执行 `git rebase main`：

```
# 初始状态：从 B 创建了 feature 分支
    A---B  main
         \
          C---D  feature

# main 分支继续有新提交
          C---D  feature
         /
    A---B---E---F  main

# 在 feature 分支执行: git rebase main
# Git 会：
# 1. 找到共同祖先 B
# 2. 暂存 feature 的提交 C、D
# 3. 将 feature 指针移到 main 的最新提交 F
# 4. 依次应用 C、D 的修改，生成新提交 C'、D'

    A---B---E---F  main
                 \
                  C'---D'  feature

# 原来的 C 和 D 被丢弃（commit hash 已改变）
```

会把 `feature` 分支的提交 `C` 和 `D` "移动"到 `main` 的最新提交 `F` 后面，形成线性历史。注意 `C'` 和 `D'` 是全新的提交（commit hash 变了），原来的 `C` 和 `D` 被丢弃了。

**一个实用的工作流：**

```bash
# 在 feature 分支开发时，定期同步 main 的更新
git checkout feature/my-feature
git fetch origin
git rebase origin/main # 用 rebase 保持线性历史

# 开发完成后，合并回 main
git checkout main
git merge --no-ff feature/my-feature # 用 merge 保留分支信息
```

**原则：在自己的分支上用 rebase，合并到公共分支用 merge。**

## 参考资料

1. https://git-scm.com/book/zh/v2

2. https://www.atlassian.com/git/tutorials/comparing-workflows

3. https://nvie.com/posts/a-successful-git-branching-model/

**本文转载自[Linux.Do](https://linux.do/t/topic/1359887)，查看原文以获得更好的体验。**
