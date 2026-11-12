# DC2 GitHub 资格原型（不签发任何代币）

本目录仅提供**离线、可复现**的候选资格判定。输入是已经规范化并核实的 GitHub 观测数据；尚未接入 OAuth、GitHub API 或链上发行。示例 ID 和数据是虚构的，绝不能把通过判定等同于可靠身份认证。

运行：

```bash
node dc2/evaluate.mjs dc2/example-evidence.json 2026-11-12T00:00:00Z
node --test test/dc2-eligibility.test.mjs
```

规则见 `eligibility.mjs` 的 `EXPERIMENTAL_RULES`：首期决策为 **四项全部满足（AND）**：GitHub 账户至少 7 个完整公历年、原创仓库累计至少 10 个经核实的独立 Star、至少 10 个经核实的第三方合并 PR、至少 10 个 Followers。后续仅可放宽门槛，不追溯剥夺已登记资格。**这是已决定的产品门槛，但真实证据采集仍未验证，模拟器结果不构成链上资格。**

注意：GitHub REST API 的 `stargazers_count` 不等于“独立 Star”，普通 PR 列表也不等于“第三方项目合并 PR”，Followers 可以从 GitHub 资料取得，但容易刷；账户年龄也不能阻止旧号交易。后续应先设计可信的数据采集和 provenance，再接真实账户。永久资格只在最终链上登记成功后生效，单次离线结果绝不是链上资格。

参见 `docs/DC2-PLAN.md`。
