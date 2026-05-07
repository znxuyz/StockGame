# public/assets — 美術素材放置區

> 階段 3-5 的 UI 重構素材都丟進這裡。
> 神獸立繪仍在 `public/sprites/`(舊路徑,保持不動)。

## 資料夾結構

```
public/assets/
├── bg/             全螢幕背景圖
├── ui/             HUD 裝飾框、徽章
├── btn/            底部 4 顆功能按鈕的 PNG icon
├── particles/      Phaser 粒子系統用的 sprite
└── audio/          BGM + 音效
```

---

## bg/ — 背景圖

| 檔名 | 規格 | 必填 |
|---|---|---|
| `main.png` | 1920×1440 以上,JPG/PNG 都可,**不需去背** | ✓ |

- 全螢幕鋪設,4 角會被切到沒關係(`background-size: cover`)
- 視差捲動會微偏移,所以圖比畫面大 10% 比較好

---

## ui/ — HUD 裝飾

| 檔名 | 規格 | 必填 |
|---|---|---|
| `top_banner.png` | 透明 PNG,寬高比 ≈ 8:1 | ✓ |
| `badge_pet.png` | 透明 PNG,正方形 ≤ 128×128 | 可省 |
| `frame_card.png` | 透明 PNG,9-slice 邊框風 | 可省 |

---

## btn/ — 功能按鈕 icon

| 檔名 | 對應功能 | 規格 |
|---|---|---|
| `buy.png` | 🥚 買入神獸 | 透明 PNG,256×256 |
| `feed.png` | 🍖 餵食加碼 | 同上 |
| `sell.png` | 📦 售出神獸 | 同上 |
| `records.png` | 📜 紀錄 | 同上 |

**命名固定不可改** — `BottomBar.tsx` 會 hard-code 這 4 個檔名。

> 如果原圖還沒去背:**先丟原圖**,我會寫 `scripts/process-ui-icons.mjs` 用 sharp 閾值去背(跟 sprites 同一招)。

---

## particles/ — 粒子素材

| 檔名 | 規格 | 用途 |
|---|---|---|
| `petal.png` | 透明 PNG,64×64 | 環境櫻花飄落 |
| `spark.png` | 透明 PNG,64×64 | 點擊金光 |

---

## audio/ — BGM + 音效(階段 5)

| 檔名 | 用途 | 規格 |
|---|---|---|
| `bgm_guzheng.ogg` | 古箏背景音樂(loop) | OGG / MP3,< 2MB |
| `click.ogg` | 點擊「叮」 | < 50KB |
| `coin.ogg` | 賣出金幣聲 | < 50KB |

**授權**:必須 CC0 / 免費商用。建議來源:
- Pixabay Music:https://pixabay.com/music/
- Freesound:https://freesound.org/(CC0 過濾)
- Zapsplat:https://www.zapsplat.com/

---

## 神獸立繪命名規則(已存在,放這提醒)

路徑:`public/sprites/<id>.png`
`<id>` = `src/data/creatures.ts` 裡的 pinyin slug,例如:
- `lingxiao.png`(凌霄)
- `jiuwei.png`(九尾)

新增神獸用 `scripts/download-sprites.mjs --remove-bg` 跑自動色彩閾值去背 pipeline(必須在使用者本機 / 非 CI 跑)。
