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

### 3.3 進化(Ascended Form) — **降低 oref 權重 + 加強轉變描述**
```
A celestial ascended {visual_subject} transcending into divine form,
golden crackling lightning bolts erupting around the body, swirling
ethereal ink clouds enveloping the figure, glowing vermillion red and
gold mandorla halo radiating behind, body emanating divine brilliance
with sacred energy, dramatic transformation moment, soaring upward
majestic pose, side view full body, {visual_features}. {STYLE_BLOCK}
--ar 1:1 --style raw --v 7 --sref [STYLE_REF] --sw 200 --oref [CHAR_REF] --ow 25
```

### 3.4 黑化(Corrupted Form) — **降低 oref 權重 + 加強轉變描述**
```
A corrupted demonic {visual_subject}, body twisted and emaciated wreathed
in swirling thick black ink miasma, glowing crimson red eyes piercing
through dark smoke, sinister hunched aggressive pose with bared fangs
and snarling mouth, dark vapor streaming from the body, ominous demonic
aura, evil corruption visible on body, side view full body,
{visual_features} darkened and tattered. {STYLE_BLOCK}
--ar 1:1 --style raw --v 7 --sref [STYLE_REF] --sw 200 --oref [CHAR_REF] --ow 25
```

> **進化 / 黑化重要參數**:
> - `--ow 25` 把 omni 權重從預設 100 降到 25,讓 prompt 的「轉變」描述能蓋過 anchor 姿勢
> - `--sw 200` 把 style 權重提高到 200,維持水墨風一致
> - `{visual_subject}` = 簡化版主體(例:`azure dragon` / `white tiger` / `vermillion phoenix`)
> - `{visual_features}` = 該神獸的關鍵特徵(例:`deer-like antlers, long flowing whiskers, scales rendered with delicate ink brush strokes`),從 §4 的 `{visual}` 抽出
>
> 如果 `--ow 25` 還是看不出轉變,降到 `--ow 10`,再不行直接拿掉 `--oref`(只剩 sref 鎖風格)。

### 3.5 v7 syntax 重點(避免踩雷)
- **`--cref` 是 v6 舊語法,v7 已失效** — 一律用 `--oref`(Omni Reference)
- **MJ web UI 會把多餘的 URL 塞到 Image Prompts 欄,要手動清掉**
- 確認送出前 3 個欄位狀態:
  - Image Prompts:**空**
  - Style References:有縮圖
  - Omni Reference:有縮圖

---

## 4. 40 隻神獸視覺描述表

順序按 `creatures.ts` 排列,**id 與檔名一致**。建議跑完一個 category(4–8 隻)就把所有產出 URL 填回這份文件,避免之後找不到。

### 四象 four-symbols

| # | id | 中文 | `{visual}`(替換進模板) |
|---|---|---|---|
| 1 | `azure-dragon` | 青龍 | (見 §2,跳過站) |
| 2 | `white-tiger` | 白虎 | A majestic white tiger of Chinese mythology, bold black ink stripes flowing across snow-white fur, fierce eyes, sharp claws, side view full body |
| 3 | `vermilion-bird` | 朱雀 | A vermillion phoenix-like sacred bird of Chinese mythology, fiery red plumage with golden highlights, long elegant tail feathers trailing flames, side view full body |
| 4 | `black-tortoise` | 玄武 | A massive ancient black tortoise of Chinese mythology with a long serpent intertwined around its mossy patterned shell, dignified northern guardian, side view full body |

### 龍族 dragon

| # | id | 中文 | `{visual}` |
|---|---|---|---|
| 5 | `ying-long` | 應龍 | A winged dragon of Chinese mythology, classical Chinese dragon body with feathered wings spread wide, four-clawed warrior posture, ancient battle aura, side view full body |
| 6 | `zhu-long` | 燭龍 | A colossal torch dragon of Chinese mythology, immense red-scaled serpent body with a human-like face, eyes radiating bright torch light, side view full body |
| 7 | `jiao-long` | 蛟 | A jiao water serpent dragon of Chinese mythology, slick dark-scaled serpentine body without antlers, surrounded by curling water swirls, side view full body |
| 8 | `hui` | 虺 | A young hui pre-dragon serpent of Chinese mythology, small simple coiled snake form, subtle thin scales, plain humble pose, side view full body |
| 9 | `kui` | 夔 | A kui thunder beast of Chinese mythology, one-legged ox-like beast with single horn, body crackling with arcing lightning, drum-skin texture on torso, side view full body |

### 鳥族 bird

| # | id | 中文 | `{visual}` |
|---|---|---|---|
| 10 | `feng-huang` | 鳳凰 | A radiant phoenix of Chinese mythology, five-color plumage rendered in ink black + vermillion red + muted gold + sage green + ivory, long tail feathers like rising flames, side view full body |
| 11 | `luan-niao` | 鸞鳥 | A luan auspicious bird of Chinese mythology, peacock-like elegant body, harmonious graceful posture, ornate tail feathers, side view full body |
| 12 | `qing-niao` | 青鳥 | A small swift azure-blue messenger bird of Chinese mythology, alert graceful pose, small scroll tied to leg, side view full body |
| 13 | `bi-fang` | 畢方 | A bifang fire crane of Chinese mythology, one-legged crane body with red ink markings, small flames trailing behind wings, side view full body |
| 14 | `zhong-ming` | 重明鳥 | A zhongming twin-pupil bird of Chinese mythology, large eagle-like body with distinctive double-pupil eyes, vigilant proud pose, side view full body |
| 15 | `san-zu-wu` | 三足烏 | A sanzuwu three-legged crow of Chinese mythology, jet-black ink crow with three legs, golden sun disc emblem glowing behind, side view full body |

### 招財 lucky

| # | id | 中文 | `{visual}` |
|---|---|---|---|
| 16 | `qilin` | 麒麟 | A qilin of Chinese mythology, deer-like body covered in dragon scales, single antler, fire mane along the neck, peaceful sage aura, side view full body |
| 17 | `pixiu` | 貔貅 | A pixiu winged lion-beast of Chinese mythology, fierce muscular body, gaping mouth, small wings, scattered ancient gold coins around its feet, side view full body |
| 18 | `bai-ze` | 白澤 | A baize wisdom beast of Chinese mythology, white lion-like body with multiple eyes along its torso, contemplative wise pose, ancient scrolls floating nearby, side view full body |
| 19 | `bi-xie` | 辟邪 | A bixie female pixiu variant of Chinese mythology, similar to pixiu but more refined and elegant, two small horns, protective stance, side view full body |
| 20 | `tian-lu` | 天祿 | A tianlu male pixiu variant of Chinese mythology, single horn, regal commanding stance, golden ink highlights, side view full body |

### 異獸 beast(含 飛廉/角端/朱厭/巴蛇 等)

| # | id | 中文 | `{visual}` |
|---|---|---|---|
| 21 | `nine-tail-fox` | 九尾狐 | A nine-tailed fox of Chinese mythology, graceful slender fox body with nine flowing fanned-out tails, golden-red ink wash, mysterious gaze, side view full body |
| 22 | `di-ting` | 諦聽 | A diting hybrid beast of Chinese mythology, lying low to ground listening, dragon-like head, ox ears, tiger paws, lion mane, scaled body, side view full body |
| 23 | `kai-ming` | 開明獸 | A kaiming nine-headed guardian of Chinese mythology, tiger body with nine human heads emerging from neck, fierce gate-keeper stance, side view full body |
| 24 | `zou-yu` | 騶虞 | A zouyu benevolent tiger of Chinese mythology, white tiger body with long flowing black ink stripes, gentle calm expression despite fierce form, side view full body |
| 25 | `bo` | 駁 | A bo white horse-beast of Chinese mythology, white horse-like body with saw-shaped teeth visible, fierce mane, predator's stance, side view full body |
| 26 | `lu-wu` | 陸吾 | A luwu mountain god of Chinese mythology, tiger body with nine swishing tails, human face on tiger head, tiger claws, mountain-deity aura, side view full body |
| 27 | `ying-zhao` | 英招 | A yingzhao patrol deity of Chinese mythology, horse body with human face, tiger stripes on flank, large bird wings spread, ready to soar, side view full body |
| 28 | `ru-shou` | 蓐收 | A rushou autumn metal god of Chinese mythology, fierce warrior figure with a snake coiled on left ear, riding a swirling cloud, side view full body |
| 29 | `fei-lian` | 飛廉 | A feilian wind deity of Chinese mythology, deer-like body with sparrow head and snake tail, wind currents trailing from body in motion, side view full body |
| 30 | `jiao-duan` | 角端 | A jiaoduan single-horned beast of Chinese mythology, swift rhino-like body with one straight horn, far-traveling pose mid-stride, side view full body |
| 31 | `zhu-yan` | 朱厭 | A zhuyan ominous beast of Chinese mythology, small-headed white-furred beast with bright red feet, unsettling staring gaze, ominous war-omen aura, side view full body |

### 水族 aquatic

| # | id | 中文 | `{visual}` |
|---|---|---|---|
| 32 | `kun` | 鯤 | A kun colossal mythical fish of Chinese mythology, mountain-sized deep-sea fish body, mid-transformation with bird-like wings beginning to emerge from sides, side view full body |
| 33 | `heng-gong` | 橫公魚 | A henggong fish of Chinese mythology, fish body in mid-transformation with humanoid features partially emerging, mysterious dual-form, side view full body |
| 34 | `wen-yao` | 文鰩魚 | A wenyao flying fish of Chinese mythology, fish body with elegant bird wings, leaping out of water mid-flight, glittering ink-stroke scales, side view full body |
| 35 | `he-luo` | 何羅魚 | A heluo fish of Chinese mythology, surreal one-headed fish with ten splayed bodies fanning out from a single head, hydra-like, side view full body |
| 36 | `lu` | 鯥 | A lu hybrid fish of Chinese mythology, fish body with snake tail, small bird wings, ox-like ribs visible, surreal chimera, side view full body |
| 37 | `ba-she` | 巴蛇 | A bashe colossal serpent of Chinese mythology, immense dark snake body with a slight midriff bulge (having swallowed an elephant), intimidating coiled stance, side view full body |

### 靈體 spirit

| # | id | 中文 | `{visual}` |
|---|---|---|---|
| 38 | `di-jiang` | 帝江 | A dijiang formless deity of Chinese mythology, faceless round blob-like body with six legs and four wings, abstract dancing posture, side view full body |
| 39 | `qi-tu` | 鵸鵌 | A qitu surreal bird of Chinese mythology, three-headed bird with six tails fanning symmetrically, balanced ornamental pose, side view full body |
| 40 | `zhi` | 彘 | A zhi mountain beast of Chinese mythology, tiger body with a human face, fierce stance on a cloud-wreathed peak, storm-bringing aura, side view full body |

---

## 5. 推薦執行順序

### Phase 1:Anchor(第 1 天,當天搞定)
1. 跑 §2 青龍站,Fast Mode 反覆試到滿意 → URL 存成 STYLE_REF
2. 用 §3.2/3.3/3.4 模板跑青龍的「走 / 進化 / 黑化」(`[CHAR_REF]` = 青龍站 URL)
3. 看青龍 4 個動作擺一起風格是不是統一,**不統一就回 step 1 改 anchor**

### Phase 2:批量(第 2–5 天,Slow Mode 排隊跑)
照 §4 表格從上到下,每隻先跑「站」,記 URL 當該隻的 CHAR_REF,再跑該隻的走 / 進化 / 黑化。
- 一隻 = 4 張 prompt = 16 個 4-grid variants(MJ 一次出 4 張)
- 40 隻 × 4 動作 = 160 prompts ≈ 640 張變體裡面挑 160 張用
- **不要追求完美**,每組 4 變體中有 1 張能用就採用

### Phase 3:後續美術(寵物完成再回頭談)
- PWA app icon(取代目前 favicon.svg 占位)
- 地圖背景(沙漠 → 水墨山水)
- 地圖裝飾物(松 / 石 / 雲,取代仙人掌 emoji)
- 境界光環圈(目前是純色 ring,改水墨筆刷圈)
- Modal / 按鈕 / 卡片框(古紙 / 印章風)
- 50 個成就獎章圖示

這些等寵物 sprite 全部就位、接進遊戲確認可行後再來寫 prompt,避免方向錯了重做。

---

## 6. 產出 URL 對照表(填入用)

跑完後把每張的 image link 填這裡,我寫 background removal + atlas 打包腳本時要用。

| id | 站 (idle) | 走 (walk) | 進化 (ascended) | 黑化 (corrupted) |
|---|---|---|---|---|
| `azure-dragon` (= STYLE_REF) | | | | |
| `white-tiger` | | | | |
| `vermilion-bird` | | | | |
| `black-tortoise` | | | | |
| `ying-long` | | | | |
| `zhu-long` | | | | |
| `jiao-long` | | | | |
| `hui` | | | | |
| `kui` | | | | |
| `feng-huang` | | | | |
| `luan-niao` | | | | |
| `qing-niao` | | | | |
| `bi-fang` | | | | |
| `zhong-ming` | | | | |
| `san-zu-wu` | | | | |
| `qilin` | | | | |
| `pixiu` | | | | |
| `bai-ze` | | | | |
| `bi-xie` | | | | |
| `tian-lu` | | | | |
| `nine-tail-fox` | | | | |
| `di-ting` | | | | |
| `kai-ming` | | | | |
| `zou-yu` | | | | |
| `bo` | | | | |
| `lu-wu` | | | | |
| `ying-zhao` | | | | |
| `ru-shou` | | | | |
| `fei-lian` | | | | |
| `jiao-duan` | | | | |
| `zhu-yan` | | | | |
| `kun` | | | | |
| `heng-gong` | | | | |
| `wen-yao` | | | | |
| `he-luo` | | | | |
| `lu` | | | | |
| `ba-she` | | | | |
| `di-jiang` | | | | |
| `qi-tu` | | | | |
| `zhi` | | | | |

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
