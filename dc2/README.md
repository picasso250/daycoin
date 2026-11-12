# DC2 GitHub 资格原型（不签发任何代币）

本目录仅提供**离线、可复现**的候选资格判定。输入是已经规范化并核实的 GitHub 观测数据；尚未接入 OAuth、GitHub API 或链上发行。示例 ID 和数据是虚构的，绝不能把通过判定等同于可靠身份认证。

运行：

```bash
node dc2/evaluate.mjs dc2/example-evidence.json 2026-11-12T00:00:00Z
node --test test/dc2-eligibility.test.mjs
```

规则见 `eligibility.mjs` 的 `EXPERIMENTAL_RULES`：账号年龄两年，且在仓库数、独立 Star、独立项目已合并 PR、跨月贡献中至少满足两项。**阈值只是为测试提供的默认参数，并未确定。**

注意：GitHub REST API 的 `stargazers_count` 不等于“独立 Star”，普通 PR 列表也不等于“第三方项目合并 PR”，贡献跨度不能简单用一次 API 返回的活动数量代替。后续应先设计可信的数据采集和 provenance，再接真实账户。永久资格只在最终链上登记成功后生效，单次离线结果绝不是链上资格。

参见 `docs/DC2-PLAN.md`。
