# DayCoin Whitepaper v0.2

**DayCoin · One Coin One Day**

*A monetary experiment in continuous issuance, voluntary participation and fairer distribution*

**17 October 2026 | Public research draft**

> Freedom is the principle. Equality is the goal. Experimentation is the method.
> **We reward work, but do not punish those who do not work.**

**Scope:** This paper distinguishes values, deployed contract rules, independently verifiable on-chain facts, and economic hypotheses awaiting evidence. DC1 has been deployed and completed its first Mainnet Deposit → Claim → Withdraw cycle. It has not undergone an independent security audit, demonstrated one-person-one-share issuance, or established stable purchasing power. This paper is not investment advice or a promise of returns, redemption or safety.

**Production network: Ethereum Mainnet (Chain ID 1).** The DayCoin V1 (DC1) Mainnet contract is [`0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715`](https://etherscan.io/address/0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715). Sepolia test contracts and historical UBIC1 contracts are separate on-chain assets. Appendix A records the initial verification transactions, blocks and compilation evidence.

## Abstract

DayCoin asks: **Can we build an issuance mechanism that needs no continuing approval from a central institution, keeps the door open to newcomers, and moves toward equal standing for every person?** Our ideal is equal, continuous access to basic issuance for every natural person. Work, creation, investment and voluntary exchange can still provide additional income.

The first generation, DC1, begins with rules that are simple and verifiable, but far from equal in human terms: **each eligible Ethereum address accrues 1 DC1 per 86400 eligible seconds**, with an initial deposit threshold of 0.1 ETH. An address is not a person. Those with capital can claim through multiple addresses, so DC1 cannot be described as universal basic income.

We intend to test access for newcomers, concentration of issuance, actual demand and purchasing power, and whether fixed rules can endure without founder intervention. We do not assume prices must rise, or mistake open issuance, more addresses or a larger market capitalization for success in achieving fairness.

### The ideal and the present reality

| Question | Long-term ideal | DC1 today |
| --- | --- | --- |
| Who receives new coins? | Every natural person | Every Ethereum address meeting the ETH deposit threshold |
| Daily share | 1 coin per person | Accrual by the second, equivalent to 1 coin per eligible address per day |
| Identity | Privacy-respecting, reliable resistance to multiple identities | No proof of personhood; one person may control many addresses |
| Capital required | Basic issuance eligibility independent of wealth | Initially at least 0.1 ETH; rising by 0.1 ETH every 1000 days |
| Actual issuance | Eligibility determined automatically, with continuous access to claims | Minted only through an active `claim()`; unclaimed rewards may be forfeited |
| Operating network | Open competition and institutional evolution | The project currently operates only DC1 on Ethereum Mainnet |

**Three distinctions:** Equal token quantities do not mean equal purchasing power. Equality among addresses is not equality among people. Depositing ETH for eligibility is not buying DC1 with ETH.

## 1. Goals and the limits of our claims

### 1.1 The personhood principle

Our long-term ideal is equal basic issuance eligibility for every natural person, without requiring proof of wealth, labor, intelligence, ability to work or market demand. Work should be a right and a freedom, rather than an obligation imposed as a condition of basic subsistence.

A society can allow markets to reward different contributions while also providing basic income independent of work. Let a person's total monetary income be

\[
Y_i(t)=b_i(t)+R_i(t),\qquad b_i(t)=b(t)\quad\text{(ideal personhood model)}
\]

Here \(R_i\) may come from work, innovation, investment, trade or other voluntary activities. DayCoin has no authority over anyone's total income. It only attempts to establish rules for one component of basic monetary issuance. **Equal basic issuance eligibility is neither equal accumulated wealth nor equal final income.**

### 1.2 A purchasing-power aspiration

One tangible long-term aspiration is that **1 DayCoin per person per day** could buy a local basic food basket equivalent to two steamed buns and two eggs. **RMB 3/day**, or roughly **US$0.4/day**, is a scenario benchmark only: not a quotation, fixed exchange rate, price promise or complete nutritional standard.

Let \(C_{f,i}(t)\) be the cash cost of that basket in location \(i\), and \(P_i^{net}(t)\) the executable value of one DayCoin after slippage, fees and practical barriers to conversion. Define

\[
A_i(t)=\frac{P_i^{net}(t)}{C_{f,i}(t)}.
\]

\(A_i\ge1\) means one day's reward can buy that basket. It does not mean it can fund a complete livelihood, nutrition or healthcare. We do not seek an endlessly rising token price, but sufficient, realizable and relatively stable purchasing power.

### 1.3 Freedom and limits on power

Joining, leaving, holding, transferring and choosing competing protocols should be voluntary. A protocol should not create an identity authority with arbitrary powers of exclusion merely to improve the appearance of fairness. Public rules, verifiable code and competition between versions take precedence over permanent founder discretion.

## 2. Four bases for distribution and their limits

We distinguish capital, labor, time of entry and personhood as bases for distribution. Bitcoin's original PoW issuance is tied to computing power; proof-of-stake validator rewards relate to staked capital. DayCoin's ultimate goal is issuance based on personhood. Its first ETH deposit experiment still ties eligibility to capital. Earlier participants can accumulate coins earlier while bearing early risks, but equal quantities of new coins do not imply equal real purchasing power.

Let \(x_i(t)\) be the new issuance actually received by natural person \(i\) during a period, and \(N\) the entire population under study. Jain's index is

\[
J(t)=\frac{(\sum_i x_i)^2}{N\sum_i x_i^2}.
\]

If everyone receives the same **positive share**, \(J=1\). If one person receives everything, \(J=1/N\). If nobody receives new coins, the denominator is zero and **\(J\) is undefined for that period**; this is not evidence of fairness. **The unit must be a natural person, not an address presented as a person.** Count non-claimants as zero and disclose coverage alongside the index to reveal exclusion.

Four measures serve different purposes:

1. **Coverage \(C\):** unique natural persons actually receiving a basic share / target population. Without identity data, only estimated ranges are possible.
2. **Concentration \(J\):** fairness of new issuance by ultimate human beneficiary, supplemented by the largest-holder share, Gini coefficient and other measures.
3. **Access cost \(K\):** capital committed, opportunity cost, transaction fees, technical barriers and risk of loss, especially for people with little wealth.
4. **Purchasing power \(A\):** how much local basic food one reward can actually buy, and the number of people \(H\) able to realize it.

Report **intergenerational measures** separately: compare cumulative claims, actual participation costs and net purchasing power over equal participation durations for cohorts entering in different years. A nominal 1 DayCoin in different years does not mean the same standard of living.

## 3. DC1 rules and deployment boundaries

The sole current production source is [`contracts/DayCoinV1.sol`](contracts/DayCoinV1.sol). The earlier `UBIC1V02.sol` and historical specification remain in Git revision [`b8d6fb3`](https://github.com/picasso250/daycoin/tree/b8d6fb3). They are outside the current default build directory and do not identify DC1 on-chain.

DC1 is an ERC-20 Burnable token: Name `DayCoin V1`, Symbol `DC1`, 18 decimals. It has no Owner, discretionary administrator minting, pause, upgrade or rescue mechanism. ETH is principal recorded for each user in the contract, which `withdraw()` attempts to return. **It earns no interest and is not a reserve for redeeming DC1.**

| Fixed parameter | DC1 rule |
| --- | --- |
| Network and Chain ID | Ethereum Mainnet, `1` |
| Initial eligibility threshold | `0.1 ETH` |
| Threshold adjustment | Increases by `0.1 ETH` every 1000 days from contract genesis |
| Eligible issuance rate | `1 DC1` per address per 86400 seconds, calculated by the second |
| Position | One principal balance and time cursor per address; depositing more does not increase that address's daily rate |
| Actual minting | Only when the user actively calls `claim()` |
| Contract authority | No Owner, proxy upgrade, administrator minting or pause |

### 3.1 Operations and risks

- **Deposit:** Deposit any positive amount of ETH. A further deposit adds to principal, resets the time cursor and irreversibly forfeits all previously unclaimed rewards. No new rewards accrue below the threshold.
- **Eligibility threshold:** From contract genesis, \(k(t)=0.1\,\mathrm{ETH}\times(1+\lfloor t/1000\,\mathrm{days}\rfloor)\). It rises by 0.1 ETH every 1000 days. This is an eligibility requirement, not a purchase price paid to an issuer.
- **Claim:** Rewards accrue at 1 coin per 86400 eligible seconds. Minting occurs only on an active claim; fractional claims are allowed. Losing current eligibility does not prevent claiming rewards accrued while eligible, but no new rewards accrue during ineligibility. Each calculation rounds down; tiny remainders do not carry forward.
- **Withdraw:** Attempt to recover all ETH principal at any time. Partial withdrawals are not supported. Withdraw does not automatically claim rewards: all unclaimed rewards are forfeited. Gas is paid separately. A contract account unable to receive native ETH may be unable to recover principal.
- **Burn:** Holders may voluntarily destroy their tokens. There is no automatic burning of deceased holders' balances, compulsory price management or redemption peg.

For example, an address depositing 0.1 ETH at genesis can accrue rewards for the first 1000 days. On day 1000 the threshold rises to 0.2 ETH; the position stops earning new rewards, but past rewards remain claimable. Topping up with Deposit before Claim forfeits those rewards. Claiming first preserves them. A larger principal does not increase one address's daily rate, but can maintain eligibility for longer. Multiple controlled addresses can claim in parallel.

**Mainnet evidence as of 2026-10-17:** DC1 completed its first real-wallet Deposit, Claim and Withdraw cycle, reconciled against block events, ETH balances and ERC-20 minting. An independent third-party security audit has not been completed. One successful cycle does not establish safety for every wallet type, malicious call or long-term economic scenario. See section 3.3 and Appendix A.

### 3.2 Minimal implementation and verifiability

DayCoin begins with the simplest practical mechanism. The project's own Solidity source for the production [DayCoin V1 contract](contracts/DayCoinV1.sol) is **108 lines**, including comments and blank lines but excluding the terminal newline. **This excludes inherited OpenZeppelin implementations.**

The custom position has only two fields: `principal` (withdrawable ETH principal) and `cursor` (the reward time cursor). Issuance centers on `deposit()`, `claim()` and `withdraw()`. OpenZeppelin components provide standard ERC-20 transfers and voluntary burning.

| Engineering characteristic | DC1 implementation |
| --- | --- |
| Project-owned Solidity source | 108 lines, including comments and blank lines |
| Custom position fields per address | 2: `principal`, `cursor` |
| Main user fund operations | 3: `deposit()`, `claim()`, `withdraw()` |
| Owner or administrator privileges | None |
| Proxy upgrades or arbitrary administrator minting | None |
| Administrator pause or rescue | None |
| Standard token and security dependencies | OpenZeppelin ERC20, ERC20Burnable, ReentrancyGuard, SafeCast |

Fewer features, state variables, complex branches and administrator powers can reduce the burden of understanding and testing, making independent review easier. But **there is no reliable simple ratio between lines of code and vulnerabilities**. One critical line can cause severe losses; a short source file may inherit much more dependency code. Immutability also makes flaws in the original contract difficult to fix.

Minimalism imposes explicit costs: top-ups forfeit unclaimed rewards, withdrawals cannot be partial, and contract wallets unable to receive native ETH may be unable to recover principal. The interface and specification must disclose these prominently. Public source, unit tests and brevity cannot replace dependency review, deployed-bytecode verification, independent security audits and real-wallet end-to-end testing.

DC1 changed only the historical v0.2 contract name, ERC-20 name/symbol and comments; it was recompiled, unit-tested and checked against deployed bytecode. **This is not an independent security audit, and DC1 is not the same on-chain asset as the old contract.**

**Minimal Code. Minimal Authority. Maximum Verifiability.**

### 3.3 Real Ethereum Mainnet verification

Using an ordinary externally owned account, we began with an eligible 0.1 ETH position and executed three real Mainnet transactions. All times below are UTC.

| Step | Block / time | On-chain result | Actual gas fee |
| --- | --- | --- | ---: |
| [Deposit](https://etherscan.io/tx/0x87b53a7cc289ff0de88e711252c82185d2bd992e44bda7ea946804e92b182b20) | `26211013` · 08:14:59 | `Deposited`: 0.1 ETH principal | 0.000015376944448944 ETH |
| [Claim](https://etherscan.io/tx/0x4ec4d1c787977df07d51c4d74bd88d198a6dfce929e329bf8751948ff0b91701) | `26211304` · 09:13:23 | `Claimed` + `Transfer` from the zero address: 0.040555555555555555 DC1 minted | 0.000016112065725104 ETH |
| [Withdraw](https://etherscan.io/tx/0xfb241e5b3b201b488909f75f93f8834d96679613611bbe1738936dab7a9ffadf) | `26211307` · 09:13:59 | `Withdrawn`: 0.1 ETH principal returned | 0.000007670007468144 ETH |

The on-chain interval from Deposit to Claim was **3504 seconds**, matching the minted amount exactly:

\[
\left\lfloor\frac{3504\times10^{18}}{86400}\right\rfloor
=40555555555555555\ \text{base units}
=0.040555555555555555\ \mathrm{DC1}.
\]

Another 36 seconds elapsed between Claim and Withdraw. That unclaimed eligible time was forfeited on withdrawal. The contract held 0.1 ETH at block `26211306` and 0 ETH after withdrawal in block `26211307`. The account's position principal and `pending` became zero, while **the minted balance of 0.040555555555555555 DC1 remained**. Total fees were **0.000039159017642192 ETH**. Principal was fully returned; gas was not refunded.

**What this proves:** These observations support deposit accounting, per-second minting, withdrawal and separation of rewards from principal for a standard externally owned account in this interval. Unit, simulated EVM and browser tests cover additional branches. This **is not a third-party security audit**, nor an empirical test of Mainnet day 1000, extreme congestion, all smart contract wallets or future prices. Compilation-to-bytecode checks establish reproducible deployment consistency, not independent source-code auditing.

## 4. Supply and inflation: accrual is not minting

Measure time in years. Let \(n_a(t)\in\{0,1\}\) indicate address \(a\)'s eligibility for new rewards at time \(t\), with maximum annual rate \(q=365\) coins, ignoring seconds, leap years and tiny rounding effects. Let \(B(t)\) be cumulative actual burns. Theoretical cumulative issuance entitlement is

\[
E(t)=\sum_a\int_0^t q n_a(u)\,du.
\]

**This is not on-chain ERC-20 supply.** DC1 rewards require an active Claim to be minted, and may be forfeited through a top-up or withdrawal. Let \(M(t)\) denote cumulative actual minting, \(F(t)\) definitively forfeited rewards and \(U(t)\) still-claimable unminted rewards. The idealized accounting relationship is

\[
E(t)=M(t)+F(t)+U(t)+\varepsilon(t),\quad S(t)=M(t)-B(t).
\]

\(\varepsilon\) represents small or unallocated differences from rounding and observation cutoffs. Never substitute \(E\) directly for total supply \(S\). More precisely,

\[
\dot S(t)=\dot M(t)-\dot B(t).
\]

Claims occur at discrete transaction times, so \(\dot M\) takes the form of jumps. The continuous approximation \(\dot S\approx365N-B'\) applies only when **all eligible rewards are promptly minted and none forfeited**.

### 4.1 Economic effects of a rising threshold

Let the ETH price be \(P_E(t)\). Capital committed for eligibility in dollars is \(K(t)=k(t)P_E(t)\). A user who does not top up may lose eligibility next epoch. Effective positions \(N(t)\) are therefore not simply all registered addresses and need not increase monotonically.

Suppose a fixed \(N\) addresses remain eligible, all rewards are promptly minted, and nothing is burned. The first year produces about \(365N\) coins; the second adds the same number. Absolute annual issuance is unchanged, but its proportion of existing supply falls. With time in years and initial supply zero,

\[
S(t)=365Nt,\qquad g_S(t)=\frac{\dot S(t)}{S(t)}=\frac1t,\qquad t>0.
\]

This \(1/t\) is an **idealized continuous supply growth rate under full minting**, not the current annualized on-chain inflation rate or consumer price inflation.

From a 2026 launch to 2050 is about 24 years. For constant participation, the annualized instantaneous growth rate is about \(1/24=4.17\%\), not 3%. If issuance starts at zero and \(N(t)\) increases monotonically, \(S(t)\le365N(t)t\), hence \(g_S(t)\ge1/t\). Claim delays and forfeitures further affect on-chain measurement. The date global population reaches 10 billion cannot simply be treated as the start of issuance.

Separate population growth from coverage growth: \(N_{real}(t)=H_{pop}(t)a(t)\), where \(a(t)\) is actual participation coverage. Only once coverage stabilizes and one-person-one-share is solved might population growth approximate growth in issuance participants.

## 5. Participation costs and capital-position equilibrium

Let \(q\) be annual DayCoin potentially minted by one position, \(P\) the executable token price, \(K\) the dollar value of required ETH principal, \(r\) the annual opportunity-cost and risk-compensation rate, and \(G\) gas and maintenance expenses. Assuming year-round eligibility, full claims and the ability to sell at the quoted price, approximate annual net economic surplus is

\[
\Pi=qP-Kr-G,\qquad P^*=\frac{Kr+G}{q}.
\]

This gives **a participation break-even price conditional on selling the tokens, not a token price floor**. Principal remains exposed to ETH price changes, contract failure and availability risks. Eligibility for only \(\tau\) years, or extra Claim fees, requires adjusting output and costs. These are teaching scenarios, not current market quotes:

| Scenario | Assumed ETH price | ETH threshold | Combined annual rate \(r\) | Annual cost \(G\) | DayCoin break-even price per position |
|---|---:|---:|---:|---:|---:|
| Low cost | $3,000 | 0.1 ETH | 3% | $3 | $0.0329 |
| Baseline | $3,000 | 0.1 ETH | 5% | $5 | $0.0548 |
| Higher cost | $3,000 | 0.2 ETH | 8% | $12 | $0.1644 |
| Higher threshold | $3,000 | 0.4 ETH | 8% | $12 | $0.2959 |

In the baseline, if \(P=\$0.40\), gross annual output is about \(365\times0.4=\$146/\text{year}\). Subtracting assumed costs of \(\$20\) gives a conditional net surplus of about **$126/year**. This is not a risk-free return. Inability to sell, unexpectedly high gas, ETH volatility or contract damage changes the outcome.

### 5.1 Capital and multiple addresses

If someone can commit \(W_i\) dollars of ETH, a simple upper bound on positions is

\[
 n_i\le\left\lfloor \frac{W_i}{K(t)}\right\rfloor,\quad x_i\approx365n_i\quad\text{(eligible and claimed all year)}.
\]

A larger deposit in one address does not increase its daily rate, but capital can be split across addresses. Two opposing consequences follow: continuous issuance can improve newcomers' access to new shares, while wealthier participants can hold more eligible positions at the same time. Address equality cannot establish human equality.

Let effective demand for positions be \(N(P,K,r,G,\mathcal R)\), where \(\mathcal R\) includes risks, expectations, alternative returns and operational friction. Higher prices generally strengthen incentives to open positions, other things equal, but do not guarantee more positions: available ETH, gas, risks and contract rules can constrain participation.

## 6. Price, positions and issuance: feedback and equilibrium

If the market values DC1 more highly, more people may commit ETH, establish addresses and claim. Selling those new tokens may then push prices down. Issuance is therefore not a predetermined total-supply curve.

DC1 participation changes both potential monetary demand and future issuance speed:

\[
P\uparrow\;\Rightarrow\; \Pi\uparrow\;\Rightarrow\;N_{address}\uparrow\;\Rightarrow\;\text{eligible reward generation rate}\uparrow.
\]

Selling rewards may create **conditional negative feedback**, but this is no automatic stabilization mechanism. Speculative buying, surging positions, delayed claims, ETH prices and threshold jumps can produce greater volatility.

Let \(D(t)\) denote the aggregate dollar valuation of monetary demand from all participants willing to hold DayCoin at a given price. A simplified accounting representation of equilibrium is

\[
P(t)=\frac{D(t)}{S(t)},\qquad g_P=g_D-g_S.
\]

**Caution:** Here \(D\) approximately represents the total market value of holdings, itself dependent on \(P\) and actual holding behavior. Thus \(P=D/S\) is first an accounting identity, **not an independent price prediction**. Without a demand function, executable liquidity and expectations model, inserting an arbitrary future demand figure is circular reasoning.

### 6.1 A falsifiable dynamic model

A minimal dynamic feedback system is

\[
\begin{aligned}
E'(t)&=365N(P(t),K(t),r,G,\mathcal R),\\
S(t)&=M(t)-B(t),\\
D(t)&=D_{use}(t)+D_{save}(t)+D_{spec}(t),\\
P(t)&=\mathcal P\big(D(t),S(t),\text{market depth and expectations}\big).
\end{aligned}
\]

\(E'\) is the rate of eligible reward generation; \(M\) is actual Claim minting. Transaction volume alone cannot distinguish use, saving and speculation. We need not assume in advance that prices must rise or fall.

A simple elasticity thought experiment: if position elasticity to price is \(\eta=\partial\ln N/\partial\ln P\), an independent demand shock raising price by 10% implies an approximate \(10\eta\%\) change in eligible positions, other things equal. With \(\eta=0\), reward generation initially does not respond; with \(\eta=1\), it may rise about 10%; with \(\eta=3\), about 30%. **These are local responses, not forecasts.** Long-term prices also depend on actual minting and sales.

### 6.2 Initial data to collect

Report daily, weekly and monthly eligible addresses, ETH committed, threshold stages, theoretical cumulative rewards, actual Claim minting, rewards forfeited through deposits and withdrawals, burns, Claim gas, post-claim destinations, slippage and executable depth. Estimate \(\eta\) across time windows, separating fresh capital, existing users splitting positions and common wallet controllers. Price increases may themselves attract participants; correlation alone does not establish causation.

Test at least three scenarios: no sustainable demand and weakening prices; adoption and supply growing together with uncertain prices; and real saving and transaction demand that may support price stability.

## 7. Long-term models of time, population and productivity

Even rapid output growth need not benefit DC1 holders. The purchasing-power hypothesis gains support only if holders can exchange tokens for more goods and services in real transactions.

Study issuance age, population and productivity separately. A stable future global population is a scenario, not DayCoin's promise about a date. With a stable ideal personhood-based claimant population \(N\), no net burns and full actual minting, \(S\sim365Nt\) and relative issuance tends toward zero. Death should end future eligibility, not automatically confiscate existing inheritable tokens. Fair identity verification, privacy and mistaken termination remain unsolved.

Let \(Y(t)\) be real output of the economy actually pricing in DayCoin, \(V(t)\) the corresponding monetary velocity and \(Q(t)\) the DayCoin goods-price index. Under the strong assumptions of the quantity model,

\[
S(t)V(t)=Q(t)Y(t),\qquad g_Q=g_S+g_V-g_Y.
\]

Falling goods prices, or rising purchasing power per DayCoin, require \(g_Y>g_S+g_V\). **World GDP growth cannot be inserted unconditionally into a model of a niche DayCoin economy.** We must identify circulating coins, the stability of monetary demand and the actual output traded.

Output growth is not population growth. An abstract growth-accounting function is \(Y=AK^\alpha L^{1-\alpha}\), with total factor productivity \(A\) and approximate growth \(g_Y=g_A+\alpha g_K+(1-\alpha)g_L\). TFP includes technology, organization and other residuals not explained by measurable inputs; it is not simply AI progress. Productivity gains can reach holders only when the resulting goods and services are willingly traded, saved for and valued through DayCoin.

The **time–productivity hypothesis** is conditional: once personhood coverage matures, relative issuance declines over time; if transaction and saving demand endure, productivity improvements may raise the purchasing power of each daily basic share despite ongoing issuance. This promises neither deflation in 2050, a fixed price nor future appreciation.

## 8. Monetary value and actual acceptance

Early BTC experience suggests that technical volunteers, experimental exchange and a few willing risk-takers can help an asset without compulsory redemption establish an initial market. Yet a positive price, widespread trade and basic-income functionality are very different achievements. The early BTC pizza purchase used an intermediary willing to accept BTC who bought and delivered the pizzas; the original merchant did not directly accept BTC. DayCoin's acceptance could likewise begin with small voluntary exchanges.

Potential demand includes transactions, saving, belief in the rules and speculation. Voluntary founder buybacks or burns are not price guarantees. Whatever an exchange quotes, basic income must be tested against realizable goods value.

For example, with 100 million eligible, genuinely distinct claimants each claiming one coin daily and \(P=\$0.4\), nominal new issuance would be **$40 million/day** or **$14.6 billion/year**. If half sold daily, the market would need to absorb about **$20 million/day** of new selling at that reference price, excluding older coins, direct spending, market-making and inventory across periods. Volume, market capitalization, asset reserves and executable depth are different measures.

Test holding demand, actual payments, conversion depth, fees and severe sell-offs separately. More users or a rising token price is not enough to declare basic income successful.

### 8.1 A monetary experiment that can run quietly

A public monetary system should not depend on constant founder publicity, an enthusiastic community or an active trading market to keep existing.

Early Bitcoin supporters could run nodes and verify rules voluntarily, even when few outsiders cared. DayCoin seeks another low-maintenance form of participation. Under Ethereum DC1, depositing sufficient ETH under public rules lets a participant accrue eligible rewards without daily work, promotion or founder approval. The underlying blockchain preserves state and history. **Holders must actively Claim for rewards to be minted**; the protocol does not schedule transactions itself.

Time matters not only for cumulative issuance and relative growth, but for publicly verifiable institutional history. Years of following established rules can provide evidence for trust. **Time alone guarantees neither safety, adoption nor purchasing power.**

A crucial DC1 property for quiet, long-term participation is that **falling below a rising deposit threshold stops future accrual without automatically erasing unclaimed rewards from past eligible time**. An address depositing 0.1 ETH at genesis stops gaining eligible seconds on day 1000, but can still Claim earlier rewards later if it retains the original position and has not performed a reward-clearing operation. Eligibility expiry is not a claim deadline.

Order matters: **Claim before any further Deposit or Withdraw** to preserve rewards. Otherwise DC1 permanently forfeits them. Continuing new accrual requires meeting the new threshold; claims and top-ups each require gas. Later claiming assumes the original contract remains callable, the holder controls the account and no reward-clearing operation has occurred. It is not an unconditional asset guarantee.

Early idealists may hold for years, act occasionally or leave when they no longer believe in the experiment. Participation carries no duty to promote it. The founder's intention to participate personally over the long term is not an enforceable commitment to remain forever, contribute funds, buy back tokens or support prices. More fundamentally, **the protocol should be designed to operate without the founder's presence**.

**We allow it to run quietly, to remain misunderstood for a long time, and even to fail. The strongest long-term commitment is a set of rules anyone can verify independently after the founder falls silent.**

## 9. Risks, attacks and failure conditions

**Distribution and identity:** One person can control many addresses. Wealth and technical advantage may turn nominal address equality into severe human inequality. Human coverage cannot be inferred directly on-chain. Decentralized proof of personhood remains open; no compulsory central identity authority is assumed.

**Contracts and accounts:** Immutability limits administrator power but makes bugs and design mistakes difficult to fix. Further Deposit clears all prior pending rewards; Withdraw does not Claim automatically; smart contract wallets unable to receive native ETH may be unable to recover principal. Gas spikes, wallet authorizations, lost keys, wrong networks and wrong addresses can cause real losses. Public code, automated tests, one real Mainnet cycle and bytecode verification **do not constitute an independent security audit**.

**Economics and markets:** Monetary demand may be insufficient and prices may approach zero. Continuous issuance may increase selling pressure; speculation may cause extreme volatility. ETH prices and periodic eligibility increases can disrupt participation economics. Nobody guarantees that a reward can buy food.

**Regulation and the real world:** Digital assets, trading, taxation and fundraising may be regulated differently across jurisdictions. Users must understand applicable rules. DayCoin is not a legal social-security commitment and cannot replace material supplies or public services.

**Governance and coexistence:** A founder's departure, website closure or new version should not automatically invalidate deployed DC1. Versions are independent; matching names do not make tokens interchangeable, and no migration is compulsory. Even without a contract Owner, websites, wallets and the underlying chain retain operational and security dependencies. No administrator does not mean no other risks.

At minimum, disclose these failure indicators: persistently stagnant coverage of distinct people, extreme concentration of new issuance, persistently inadequate executable food purchasing power, practically unavailable withdrawals, sustained lack of transaction and saving demand, or an irreparable serious security incident.

## 10. Experimental design and disclosure

**Observable facts:** on-chain ETH principal, eligibility stages, address activity, cumulative minting and burning, fees and actual DEX liquidity. Market data that does not exist must be marked “no data,” not zero as though a market had been observed.

**Variables requiring estimation:** unique people, linked addresses, purposes of sales, off-chain liquidity, per-person holding demand and food actually purchasable.  
**Values:** basic issuance eligibility should be as equal as possible; voluntary participation and exit take precedence over formal fairness imposed by centralized coercion.  
**Hypotheses:** continuous issuance can coexist with monetary value; demand from participation growth can offset additional supply; eventual population saturation and productivity growth may improve purchasing power.

**Validation spans different timescales.** First reconcile real transactions with contract rules, ETH returns and DC1 minting. Then track effective addresses, cumulative claims, participation costs and liquidity daily, weekly and monthly. Only over longer periods study retention, concentration and realizable purchasing power. Addresses do not directly reveal people. Without credible, lawful, privacy-respecting identity data, report “unknown” or methodologically bounded estimates.

Prioritize definitions, code versions, chain IDs, parameter time ranges, sensitivity, uncertainty intervals and evidence against the hypothesis. Do not pass off addresses as people, marginal price quotes as convertible cash flow, or market-cap growth as new real social wealth.

## 11. Version evolution and the long view

**Current project operations choose only deployed DC1 on Ethereum Mainnet.** The project does not plan to issue an “official DC1” on Arbitrum One or other chains, or build unified cross-chain issuance or automatic conversion. This is an operational choice under current resources and trust assumptions, **not a promise that plans will never change, and it does not alter deployed contracts**. Sepolia DC1 is a separate test contract.

The protocol has no exclusive authority to exclude competitors. Within applicable licenses and blockchain rules, anyone may copy, modify, deploy and compete independently. **The project need not endorse, register or license a competing protocol; neither does that protocol automatically become existing DC1 or acquire its assets and supply.**

DC1 does not automatically upgrade into DC2. Versions carry no compulsory migration, value guarantee or inherent legitimacy. DC1's scheduled ETH threshold increases are separate from new versions. Any future personhood-based mechanism must independently address privacy, resistance to multiple identities, free exit, non-exclusion and actual usability. An aspiration is not an existing capability.

## Conclusion

DayCoin is a public experiment open to refutation: **keep issuance rules beyond anyone's arbitrary control while leaving newcomers an ongoing opportunity to participate under explicit thresholds, and continue searching for mechanisms closer to one person, one share.** DC1 has not removed capital requirements; its threshold will increase.

The initial research goal is not price appreciation. It is reproducibly verified deposits, withdrawals and issuance; transparent capital and participation costs; concentration of new issuance; and persistent inquiry into whether a token has realizable purchasing power. If evidence fails to support the ideal, disclose the failure instead of rewriting the story to hide it.

**Join freely. Move toward fairness.**

---

## Appendix A: On-chain identity, code and initial evidence

### A.1 Production contract and compilation record

| Item | Verified value |
| --- | --- |
| Network | Ethereum Mainnet · Chain ID `1` |
| Contract / ERC-20 Name / Symbol | `DayCoinV1` / `DayCoin V1` / `DC1` |
| Contract address | [`0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715`](https://etherscan.io/address/0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715) |
| [Deployment transaction](https://etherscan.io/tx/0x868a542a0953ecf40458b7750d3b4082a5e74e551a437d903c01ac9e549e9155) | `0x868a542a0953ecf40458b7750d3b4082a5e74e551a437d903c01ac9e549e9155` |
| Deployment block | `26210644` |
| Genesis time (UTC) | 2026-10-17 07:00:59 (on-chain `genesisTime`) |
| Solidity | `0.8.37` · EVM Shanghai · optimizer runs=200 |
| Creation Hash (Keccak-256) | `0xd3888c5525657300e00c91245fcc9fdfde4aebfced36a92639522499362532f6` |
| Deployed Runtime Hash (Keccak-256) | `0xfdde03bc7708ba27ee8fae35e8c643e7bff09d1754dbdf173514417d33109c2c` |

Source and tests: [`contracts/DayCoinV1.sol`](contracts/DayCoinV1.sol), [`scripts/compile.mjs`](scripts/compile.mjs), [`test/dc1.test.mjs`](test/dc1.test.mjs), [GitHub Actions](https://github.com/picasso250/daycoin/actions/runs/39015124421). Reproduce with `npm run build`, and with the original deployment journal and read-only RPC access run `npm run verify -- .env.mainnet artifacts/DayCoinV1.json`. Deployment is complete. **Do not broadcast another deployment for verification.**

Solidity metadata depends on exact compilation inputs and line endings. The repository retains read-only historical compiler input to reproduce the original artifact. Runtime Hash includes constructor-set immutable values; compare against the correct Mainnet deployment rather than mechanically against template bytecode. Repository verification is a **deployment consistency check**, not a third-party audit or a conclusion that all assets are safe.

### A.2 Mainnet Deposit / Claim / Withdraw

Test address: `0x5E81BF553E9Ab75872a47bAd30A0fd3589AD215E`. See section 3.3 for transactions, amounts, blocks and gas. The read-only snapshot at block `26211314`, after the initial cycle, was:

| Observation | Value |
| --- | ---: |
| Account ETH position principal | 0 ETH |
| Account `pending` rewards | 0 DC1 |
| Account DC1 balance | 0.040555555555555555 DC1 |
| Contract ETH balance | 0 ETH |
| ERC-20 `totalSupply` | 0.040555555555555555 DC1 |

One successful cycle establishes neither human coverage, tradable market depth, token value nor long-term safety. Later transactions change live state. These are **snapshots at a specified block**, not permanent constants.

### A.3 Sepolia and historical experiments

- [Separate DC1 Sepolia test contract](https://sepolia.etherscan.io/address/0xBB322A88f2ED0EdFd3632825Cf44Bbb62B93Bd26), Chain ID `11155111`: no shared ERC-20 balances or supply with Ethereum Mainnet.
- [Historical UBIC1 v0.2 source](https://github.com/picasso250/daycoin/blob/b8d6fb3/contracts/UBIC1V02.sol) and [historical v0.2 specification](https://github.com/picasso250/daycoin/blob/b8d6fb3/UBIC1-V0.2.md) do not identify the current DC1 deployment.
- Historical UBIC1 v0.2 Sepolia test contract: `0x407892d5606b0FB91D77C62aC306566E01963674`, distinct from DC1 Sepolia.
- [Current repository](https://github.com/picasso250/daycoin) and [manifesto](Manifesto.en.md). The old `ubi.io99.xyz` interface belongs to historical UBIC1, not DC1.

## Appendix B: Terminology

- **DayCoin:** the project brand and long-term protocol family; its tagline is *One Coin One Day*.
- **DC1:** the first-generation protocol and token on Ethereum Mainnet, ERC-20 Name `DayCoin V1`, Symbol `DC1`. The identically named Sepolia contract is a separate test asset. Identity requires both network and contract address.
- **UBIC1:** an existing historical experiment, including separate historical v0.1 and Sepolia v0.2 deployments. DayCoin / DC1 branding does not modify, revoke or automatically migrate them.
- **Personhood-based issuance:** an ideal mechanism based on unique natural persons rather than numbers of addresses.
- **Eligible address:** an address meeting the principal threshold at a particular contract and time, not necessarily a distinct person.
- **Theoretical rewards:** potential claims accrued over eligible seconds; not necessarily claimed and possibly forfeited through user actions.
- **Actual supply:** cumulative minted ERC-20 tokens minus burns, distinct from unclaimed rewards and potential future issuance.
