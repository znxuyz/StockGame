# AI 美術 Prompt 集 — Midjourney v7 水墨古風

> 目標:把 40 隻神獸 × 4 動作(站 / 走 / 進化 / 黑化)+ 後續地圖 / UI / 圖示
> 全部用一致的水墨古風跑出來,**不浪費 Midjourney 訂閱錢**。
>
> 流程是**串行**的:第 1 張(青龍站)是後面所有圖的風格錨點,務必跑到滿意才往下做。

---

## 0. 開始之前

### 訂閱方案
- **訂 Midjourney Standard($30/月)**,不要訂 Basic
- Basic($10)只有 200 fast hours,跑 200+ 張會超支;Standard 有 unlimited Slow Mode
- 要省錢就**全部用 Slow Mode**(等比較久但不耗 fast hours),只有 anchor 那張用 Fast Mode 反覆試
- 做完這次美術可以馬上退訂;訂閱按月計

### 工作模式
- 不用 Discord,直接用 https://www.midjourney.com/ 網頁版,介面比較好操作
- 每張 prompt 跑完會出 4 個變體;**只要有 1 個能用就採用,不要為了完美重 roll**
- **不要 upscale**(寵物最終 sprite 只到 256×256,原圖 1024×1024 已經夠)
- 跑出來的圖**右鍵 → Copy image link**,複製貼上後面 prompt 的 `--sref` / `--cref`

### 輸出規格
- `--ar 1:1` 正方形(對應 sprite 256×256)
- `--style raw` 降低 MJ 預設的「美化」濾鏡,水墨味才出得來
- `--v 7` 用最新版

---

## 1. Style Bible(風格聖經)

下面這段叫 **`{STYLE_BLOCK}`**,後面所有 prompt 都會用到。完整貼進去,不要刪減:

```
Chinese ink wash painting (sumi-e), traditional gongbi line work,
faded rice paper texture, dominant ink black with vermillion red and
muted gold accents, calligraphy brush strokes with flying-white texture,
flat 2D illustration, no shadow, no 3D rendering, no anime style,
no cel shading, plain off-white rice paper background
```

明確排除(避免 MJ 跑歪):no anime, no chibi, no Disney 3D, no pixel art, no photo realism, no harsh outlines。

---

## 2. Anchor — 第 1 張:青龍站(STYLE_REF)

**這張務必跑到滿意才繼續**。它的 image link 會被後面 199 張 prompt 引用,叫 `[STYLE_REF]`。

### Prompt
```
An azure dragon (青龍) of Chinese mythology in side view full body,
sinuous serpentine body, four-clawed legs, deer-like antlers, long
flowing whiskers, scales rendered with delicate ink brush strokes,
calm static pose centered on canvas, body coiling slightly with quiet
power. Chinese ink wash painting (sumi-e), traditional gongbi line work,
faded rice paper texture, dominant ink black with vermillion red and
muted gold accents, calligraphy brush strokes with flying-white texture,
flat 2D illustration, no shadow, no 3D rendering, no anime style,
no cel shading, plain off-white rice paper background
--ar 1:1 --style raw --v 7
```

### 跑這張的策略
- 用 **Fast Mode**,可以多跑幾組 4 變體挑最像的
- 接受標準:水墨味濃、線條有飛白、紙質背景明顯、**沒有**動漫感 / 3D 感 / 卡通感
- 不滿意就改 prompt 開頭的 visual 描述,**`{STYLE_BLOCK}` 那段不要動**(改了風格就跑掉)
- 滿意後**右鍵 Copy image link**,把 URL 記在這個檔案最下面 §6 的 STYLE_REF 欄

---

## 3. 4 個動作的 Prompt 模板

每隻神獸都套這 4 個模板。`{visual}` 是該神獸的視覺描述(§4 表格列好),`[STYLE_REF]` 是 §2 的青龍站 URL,`[CHAR_REF]` 是該神獸自己的「站」frame URL(站做完才能跑後 3 個動作)。

### 3.1 站(Idle) — 第 1 個動作,用 STYLE_REF
```
{visual}, calm static pose centered on canvas, side view full body,
quiet contemplative aura. {STYLE_BLOCK}
--ar 1:1 --style raw --v 7 --sref [STYLE_REF] --sw 100
```

> 注:青龍自己的「站」就是 §2 那張,跳過這條,直接從「走」開始。

### 3.2 走(Walking) — 用 STYLE_REF + CHAR_REF
```
{visual}, walking pose mid-stride, body facing right, dynamic balance
with one limb lifted, sense of movement. {STYLE_BLOCK}
--ar 1:1 --style raw --v 7 --sref [STYLE_REF] --sw 100 --oref [CHAR_REF] --ow 100
```

### 3.3 進化(Ascended Form) — **不用 oref + 身體變色金/象牙白 + 強調全身**
```
A divine celestial {visual_subject} ascended into ethereal form, body
rendered in radiant pale gold and ivory ink with luminous golden details
glowing softly from within, {features_in_gold}, full body clearly visible
centered side view, calm transcendent regal pose, subtle vermillion and
gold mandorla halo behind without obscuring the body, plain clean
uncluttered composition, no smoke no clouds covering the body.
{STYLE_BLOCK_GOLD}
--ar 1:1 --style raw --v 7 --sref [STYLE_REF] --sw 200
```

### 3.4 黑化(Corrupted Form) — **不用 oref + 身體變色焦黑 + 紅脈 + 強調全身**
```
A corrupted demonic {visual_subject}, body rendered in deep charcoal
black throughout with dark corrupted {features_dark} streaked with
crimson red veins of evil corruption, glowing crimson red eyes piercing
fiercely, full body clearly visible centered side view, sinister hunched
aggressive predatory stance, dark black body color dominant throughout,
plain clean uncluttered composition, no smoke no miasma covering the body.
{STYLE_BLOCK_DARK}
--ar 1:1 --style raw --v 7 --sref [STYLE_REF] --sw 200
```

### 進化 / 黑化的 STYLE_BLOCK 變體

要把 `{STYLE_BLOCK}` 結尾的色票替換,不然 MJ 還是會被「dominant ink black」拉回原色:

**`{STYLE_BLOCK_GOLD}`** (進化用):
```
Chinese ink wash painting (sumi-e), traditional gongbi line work,
faded rice paper texture, dominant gold and ivory accents with
vermillion red, calligraphy brush strokes with flying-white texture,
flat 2D illustration, no shadow, no 3D rendering, no anime style,
no cel shading, plain off-white rice paper background
```

**`{STYLE_BLOCK_DARK}`** (黑化用):
```
Chinese ink wash painting (sumi-e), traditional gongbi line work,
faded rice paper texture, dominant ink black with crimson red veining
accents, calligraphy brush strokes with flying-white texture, flat 2D
illustration, no shadow, no 3D rendering, no anime style, no cel shading,
plain off-white rice paper background
```

> **進化 / 黑化策略要點(青龍實測通過)**:
> - **不用 `--oref`** — oref 把姿勢釘死,導致看不出轉變;只用 `--sref` 鎖風格、讓 prompt 自由發揮
> - **`--sw 200`** 把 style 權重拉高,維持水墨風一致
> - **身體顏色寫進 prompt 重點** — 進化金/象牙白、黑化焦黑+紅脈(不是只在身體周圍加效果)
> - **「full body clearly visible」+「no smoke covering」** 確保全身可見不被遮
> - `{features_in_gold}` 範例:`golden stripes`(虎)/ `golden plumage`(鳥)/ `golden scales glowing`(龍/魚)
> - `{features_dark}` 範例:`fur`(獸)/ `feathers`(鳥)/ `scales`(龍/魚)

### 3.5 v7 syntax 重點(避免踩雷)
- **`--cref` 是 v6 舊語法,v7 已失效** — 一律用 `--oref`(Omni Reference)
- **MJ web UI 會把多餘的 URL 塞到 Image Prompts 欄,要手動清掉**
- 確認送出前 3 個欄位狀態:
  - Image Prompts:**空**
  - Style References:有縮圖
  - Omni Reference:有縮圖

---

## 4. 20 隻精選花名冊

從原 40 隻山海經神獸縮編到 20 隻(10 山海經 + 10 原創),強調剪影差異化。完整 prompt(visual / subject / featuresGold / featuresDark / negative)集中在 `scripts/gen-art-prompts.mjs`,執行 `node scripts/gen-art-prompts.mjs > docs/art-prompts-batch1.md` 取得可貼進 MJ 的 36 條 prompt。

### 山海經 10 隻

| # | id | 中文 | 類別 | 獨特特徵(prompt 強調點) |
|---|---|---|---|---|
| 1 | `azure-dragon` | 青龍 | 四象 | 蛇身 + 四爪 + 鹿角 + 長鬚(STYLE_REF) |
| 2 | `white-tiger` | 白虎 | 四象 | 雪白毛 + 粗黑墨紋條橫貫全身 |
| 3 | `vermilion-bird` | 朱雀 | 四象 | 烈紅羽 + 拖尾火焰 |
| 4 | `black-tortoise` | 玄武 | 四象 | 龜甲 + 盤蛇纏繞 |
| 5 | `ying-long` | 應龍 | 龍族 | 龍身 + 羽毛翅膀(非蝙蝠翼) |
| 6 | `qilin` | 麒麟 | 招財 | 鹿身 + 龍鱗 + 單獨角 + 火焰鬃毛 |
| 7 | `nine-tail-fox` | 九尾狐 | 異獸 | 九條尾巴扇形展開 |
| 8 | `kai-ming` | 開明獸 | 異獸 | 虎身 + 九顆人頭 |
| 9 | `he-luo` | 何羅魚 | 水族 | 一頭十身扇形 |
| 10 | `di-jiang` | 帝江 | 靈體 | 無臉圓團 + 六腿 + 四翅 |

### 原創 10 隻

| # | id | 中文 | 類別 | 獨特特徵 | 主題連結 |
|---|---|---|---|---|---|
| 11 | `suanpan-shou` | 算盤獸 | 招財 | 算盤珠身 + 流蘇腿 | 股票 |
| 12 | `yinzhang-ling` | 印章靈 | 招財 | 朱紅印章身 + 篆字底刻 | 簽約/印記 |
| 13 | `qian-gui` | 錢龜 | 招財 | 銅錢層疊龜甲 | 錢 |
| 14 | `bi-hu` | 筆狐 | 異獸 | 筆觸構成狐身 + 毛筆尾 | 水墨自指 |
| 15 | `bianzhong-shou` | 編鐘獸 | 異獸 | 編鐘鐘架身軀 | 樂器 |
| 16 | `denglong-yu` | 燈籠魚 | 水族 | 紅紙燈籠頭 + 魚身 | 節慶 |
| 17 | `qi-ling` | 棋靈 | 靈體 | 黑白圍棋子身 | 策略 |
| 18 | `lianhua-shou` | 蓮華獸 | 靈體 | 蓮花瓣身 + 蓮藕腿 | 花卉 |
| 19 | `shan-tong` | 山童 | 靈體 | 石頭+松枝小人 + 山峰帽 | 山岳 |
| 20 | `tao-jing` | 桃精 | 靈體 | 桃形身 + 桃花鬃 + 桃葉翅 | 仙桃 |

---

## 5. 推薦執行順序

### Phase 1:Anchor(已完成)
青龍 4 動作完成,STYLE_REF 已固定:
```
https://cdn.midjourney.com/99f03b33-c4d5-494f-b65c-58c7a7cd3120/0_3.png
```

### Phase 2(進行中):剩 12 隻 idle / asc / corrupt
- **8 隻已完成不重跑**:青龍 / 白虎 / 朱雀 / 玄武 / 應龍 / 麒麟 / 九尾狐 / 開明獸
- **12 隻待跑**:何羅魚 + 帝江 + 10 隻原創
- prompt 全部在 `docs/art-prompts-batch1.md`(自動產生,12 × 3 = 36 條)
- 每隻挑 1 張變體 → URL 貼回 §6 表格

### Phase 3:walk batch
- §6 idle 全到齊後跑:`node scripts/gen-art-prompts.mjs --batch=2 > docs/art-prompts-batch2.md`
- 自動讀每隻 idle URL 當 oref,輸出 20 條 walk prompt
- 走姿較難跑(MJ 容易出 idle 樣),挑不到 mid-stride 就重 roll 該條

### Phase 4:Sprite 整合
- 80 張原圖到齊(20 × 4 動作)後,寫 background removal + atlas 打包腳本
- 接到 `src/game/petSprite.ts`
- 對 idle / walk frame 套 §9 的類別色 tint(差異化策略 C)

### Phase 5:後續美術(sprite 接好再做)
- PWA app icon、地圖背景、地圖裝飾(松 / 石 / 雲)、境界光環圈、Modal / 按鈕 / 卡片框、成就獎章

> **不追求完美**:每組 4 變體 MJ 出來,有 1 張能用就採用,別重 roll。

---

## 6. 產出 URL 對照表(填入用)

跑完後把每張的 image link 填這裡,我寫 background removal + atlas 打包腳本時要用。

| id | 站 (idle) | 走 (walk) | 進化 (ascended) | 黑化 (corrupted) |
|---|---|---|---|---|
| `azure-dragon` (= STYLE_REF) | https://cdn.midjourney.com/99f03b33-c4d5-494f-b65c-58c7a7cd3120/0_3.png | https://cdn.midjourney.com/2018dd0d-441e-47d5-b18e-47911032ec66/0_1.png | https://cdn.midjourney.com/94276159-c158-4a99-9435-ad6f1c627092/0_2.png | https://cdn.midjourney.com/24a4ce59-fb2d-4130-b5f9-e2ffc8386f49/0_2.png |
| `white-tiger` | https://cdn.midjourney.com/115ea07e-9077-4e50-955c-706061a3baf5/0_0.png | https://cdn.midjourney.com/dbb63e05-cc0f-41b0-b124-7bd06c907909/0_3.png | https://cdn.midjourney.com/e787b18f-e47a-4e5c-8e0e-f791754f1016/0_1.png | https://cdn.midjourney.com/5911a696-7b5c-49e3-abd1-7a839ca1ef96/0_0.png |
| `vermilion-bird` | https://cdn.midjourney.com/2aa88b1d-bd6d-4cfb-b516-b9e4746b837a/0_3.png | https://cdn.midjourney.com/f62bf3e8-4460-4565-9c72-46b43041d9cc/0_2.png | https://cdn.midjourney.com/50dd600d-41f0-488e-b07b-443b701852dd/0_2.png | https://cdn.midjourney.com/ea83e5f2-2ae1-4e2e-89d1-a4a0ef408bd4/0_1.png |
| `black-tortoise` | https://cdn.midjourney.com/1e5384ec-a38f-4c34-ba8b-b648c5f9d1d3/0_3.png | | https://cdn.midjourney.com/c2be7999-6c94-4abf-8560-0bc0d50c613b/0_3.png | https://cdn.midjourney.com/045948a5-181d-4093-9d8e-b36abd530dab/0_0.png |
| `ying-long` | https://cdn.midjourney.com/8f5dff9a-5545-4cac-9be7-712b0894af3c/0_0.png | | https://cdn.midjourney.com/ccd3010b-472a-46e9-b3a8-1bc564ab8d54/0_1.png | https://cdn.midjourney.com/16da3942-39ed-4521-a824-e38a36bad680/0_1.png |
| `qilin` | https://cdn.midjourney.com/9033069b-248e-48ba-84c6-24de2a5e95aa/0_0.png | | https://cdn.midjourney.com/9dfa7a3d-8a57-4cba-9e10-e40417b01746/0_3.png | https://cdn.midjourney.com/7dd88097-b99c-4302-b9c7-e5b55466069e/0_2.png |
| `nine-tail-fox` | https://cdn.midjourney.com/d99436c1-3152-4453-adbf-22d7d12993de/0_3.png | | https://cdn.midjourney.com/c87f1d29-7d3f-47e5-89c5-bbc1bedf21ec/0_1.png | https://cdn.midjourney.com/8ea9d048-d66a-449b-a8c2-e40a787ed739/0_3.png |
| `kai-ming` | https://cdn.midjourney.com/86714531-9637-49fc-a50e-e004f7687b6d/0_1.png | | https://cdn.midjourney.com/2e9dda33-79c7-435c-b0c8-d29d45890809/0_1.png | https://cdn.midjourney.com/75f85430-5f0a-4375-9424-98d5cbd7a0ad/0_3.png |
| `he-luo` | | | | |
| `di-jiang` | | | | |
| `suanpan-shou` | | | | |
| `yinzhang-ling` | | | | |
| `qian-gui` | | | | |
| `bi-hu` | | | | |
| `bianzhong-shou` | | | | |
| `denglong-yu` | | | | |
| `qi-ling` | | | | |
| `lianhua-shou` | | | | |
| `shan-tong` | | | | |
| `tao-jing` | | | | |

---

## 7. 下載與檔名規則

每張下載的原圖(1024×1024 PNG,白底)放到本地資料夾,命名規則:

```
<species_id>__<action>.png

範例:
azure-dragon__idle.png
azure-dragon__walk.png
azure-dragon__ascended.png
azure-dragon__corrupted.png
white-tiger__idle.png
...
```

160 張全到位後丟給我,我會跑 background removal + sprite atlas 打包,接到 `petSprite.ts` 裡面。

---

## 8. 防呆 / 常見錯誤

- **不要忘了 `--sref`** — 沒帶 STYLE_REF 跑出來的會變回 MJ 預設「華麗風」,跟其他不搭
- **不要 upscale** — 浪費 GPU hours,我們最終縮到 256×256,1024 原圖夠用
- **不要 Vary (Region)** — 改局部會破壞風格一致性,直接重 roll 整張
- **不要混用 v6.1 和 v7** — 全部用 v7
- **`--style raw` 不能省** — 不加會被 MJ 美化成偏動漫
- **`--cref` 在 v7 失效** — 一律用 `--oref`,寫 cref 會被當成 Image Prompt
- **檢查 reference 欄位**:送出前確認 Style References + Omni Reference 都有縮圖,Image Prompts 欄是**空**的(若有 URL 塞錯,點縮圖右上 X 移除)
- **背景**:prompt 已寫 plain off-white rice paper,**不要**加 white background / transparent background(MJ 對 transparent 支援不穩,我們用後製去背)
- **Fast vs Relax**:Standard plan 有 15 fast hours/月,160 prompts 全用 Fast 約 2.7 hours,綽綽有餘;Relax 卡住就直接切 Fast,別硬等

---

## 9. Sprite 整合期備忘 — 類別後製色調(差異化策略 A+C)

水墨統一風格 + MJ 收斂效應導致「不同神獸看起來太像」(尤其同類別內部:四腳獸群、龍蛇群、鳥群)。**生成階段不修**(會破壞風格一致性),改在 sprite 接進遊戲時做後製色調 tint,放大「不同類別」的視覺記憶。

打 atlas / 接 `petSprite.ts` 那步要記得:

- 依 `creatures.ts` 的 `category` 加極淡 hue tint(透明度 5–10%,不能蓋掉墨色):
  - `four-symbols` → 不加(它們本來就是四個顏色錨點)
  - `dragon` → 微青(`#0aa5b5` 5%)
  - `bird` → 微暖紅(`#c43a2c` 5%)
  - `lucky` → 微金(`#c89a3c` 5%)
  - `beast` → 微土黃(`#9c7a3a` 5%)
  - `aquatic` → 微藍(`#3a6fa8` 8%)
  - `spirit` → 微紫(`#7a4a9c` 8%)
- ascended frame **不加 tint**(已是金白,不要污染)
- corrupted frame **不加 tint**(已是黑紅,不要污染)
- 只 tint idle / walk 兩個 frame

實作可以是 canvas `globalCompositeOperation = 'multiply'` + 全圖填單色,或在 PIXI/Phaser shader 裡做。等 sprite 接進來那時再寫。

策略總綱(對應對話中討論的選項):
- **A 接受**:遊戲內有中文名 + 圖鑑 + 進化階,玩家不會擺一起逐張比對;不為了完美主義燒週末
- **C 後製類別色調**:零成本拉開類別記憶(本節)
- B(個別重做 prompt)目前不採用,除非有具體幾隻看不下去再針對性處理
