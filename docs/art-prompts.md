# 美術立繪總表

> **本文件當前用途**:管理 20 隻角色的立繪 URL + 下載流程。
> **歷史紀錄**:之前山海經 40 隻 → 20 隻、idle/asc/corrupt 三 frame 機制等
> 都已棄用。最後一版 git history 在 commit `2f9af58` 之前。
> 現採「**單一立繪 + 進化用光環顏色 + 黑化用 tint**」最簡架構。

---

## 1. 角色 + 立繪 URL 對照表

20 隻全部從 Midjourney 跑出來。`id` 對應 `src/data/creatures.ts` 的 species id,也對應下載後的檔名 `public/sprites/<id>.png`。

| # | id | 中文 | 立繪 URL |
|---|---|---|---|
| 1 | `tai-chu-yan-jun` | 太初炎君 | https://cdn.midjourney.com/212042ac-d5d6-4ec6-bd44-421470d692b2/0_1.png |
| 2 | `tai-su-xuan-lu` | 太素玄鹿 | https://cdn.midjourney.com/11a7fbe7-41d9-44c2-9a9b-c25456cf78f3/0_1.png |
| 3 | `wu-shi-zhi-die` | 無始之蝶 | https://cdn.midjourney.com/5ff76581-cfde-4708-a7cc-bdf3974a9629/0_1.png |
| 4 | `wu-ji-jin-zun` | 無極金尊 | https://cdn.midjourney.com/8920a195-eb9f-4b19-a162-fc7101bb8bda/0_0.png |
| 5 | `ji-zhi-ming` | 寂之鳴 | https://cdn.midjourney.com/25e7213c-3226-4403-afdd-5f747f2858f8/0_0.png |
| 6 | `tai-xuan-zhi-zhu` | 太玄之主 | https://cdn.midjourney.com/f52b6d34-f0e9-4026-a2fb-1e676acb49b5/0_0.png |
| 7 | `yuan-shi-lei-ting` | 原始雷霆 | https://cdn.midjourney.com/f8fa0943-e5e1-41a5-b498-b03c67912763/0_2.png |
| 8 | `wu-zi-zhi-long` | 無字之龍 | https://cdn.midjourney.com/f432ce0b-22c1-485c-8b3b-ae66c2a7c660/0_0.png |
| 9 | `heng-chun-zhi-gui` | 恆春之龜 | https://cdn.midjourney.com/8a360c16-a4d9-4981-8b7c-abcc7c8daae5/0_1.png |
| 10 | `wu-xiang-zhi-hu` | 無相之狐 | https://cdn.midjourney.com/d91f8cf2-b1f5-43cc-b960-73b001775566/0_2.png |
| 11 | `hong-meng-xue-huang` | 鴻濛血皇 | https://cdn.midjourney.com/8b205bc9-6228-4b86-b355-8b29efe450ef/0_3.png |
| 12 | `tai-bai-jian-xian` | 太白劍仙 | https://cdn.midjourney.com/3f059007-e6c2-4654-91af-4793e9a49c0a/0_2.png |
| 13 | `xuan-huang-di-mu` | 玄黃地母 | https://cdn.midjourney.com/5c931713-b5f7-472c-882b-2a1f5f5cc7f3/0_0.png |
| 14 | `cang-ming-hai-zun` | 滄溟海尊 | https://cdn.midjourney.com/5688eb6a-b07c-49a2-bb2f-ccb10d7ca70f/0_2.png |
| 15 | `huang-quan-meng-po` | 黃泉孟婆 | https://cdn.midjourney.com/62c6855e-9c86-4dd9-899a-4629d7b576d9/0_2.png |
| 16 | `zi-wei-tian-shu` | 紫微天樞 | https://cdn.midjourney.com/c0626ec1-848e-450d-8678-a0f2a525d2f0/0_1.png |
| 17 | `hong-meng-qin-zun` | 鴻蒙琴尊 | https://cdn.midjourney.com/1be5bfc3-7de8-4ae7-b06d-e5806795b1ba/0_0.png |
| 18 | `ye-huo-luo-cha` | 業火羅剎 | https://cdn.midjourney.com/ff89bb44-e2e4-4ea1-8be4-ee84dc86db56/0_1.png |
| 19 | `tai-xu-jing-jun` | 太虛鏡君 | https://cdn.midjourney.com/0bd617ba-e13c-48c1-bdbb-56c8917ecb89/0_1.png |
| 20 | `hong-jun-dao-zu` | 鴻鈞道祖 | https://cdn.midjourney.com/8dda7333-193f-446c-8d8a-b11685103c72/0_0.png |

---

## 2. 下載到本地(必須在你本機跑,不能在 sandbox)

cdn.midjourney.com 對非瀏覽器 IP 會 403,所以**必須在你電腦本機跑下載腳本**。

```bash
# 1. 確保 sharp 已裝
npm install

# 2. 跑下載
node scripts/download-sprites.mjs

# 3. 確認
ls public/sprites/    # 預期 20 個 .png(如 tai-chu-yan-jun.png 之類)

# 4. commit
git add public/sprites/
git commit -m "art: add 20 mythology pet sprites"
git push
```

腳本會:
- 從上面 §1 表抓每隻的 URL
- 用 sharp 縮成 256×256 PNG
- 存到 `public/sprites/<id>.png`(idempotent,已存在的跳過,加 `--force` 覆蓋)

---

## 3. Phaser 整合(已完成,自動)

`src/game/scene.ts::WorldScene.preload()` 對所有 `art: true` 的物種嘗試載入 `/sprites/<id>.png`。`PetSprite` 載到顯示立繪、載不到 fallback emoji。**所以本機 commit 完 PNG 就會直接看到圖**,程式碼不用動。

進化 / 黑化視覺:
- 進化(god/saint/celestial):光環顏色變(idle 圖不變)
- 黑化(cursed1/2/3):立繪套 Phaser tint `0x444444` + alpha 0.55(變灰暗)

---

## 4. 之後想加角色 / 換角色

1. 跑 MJ 拿新 URL → 加進 §1 表(新一列)
2. 改 `src/data/creatures.ts` 加新 species(`art: true`、新 emoji 兜底)
3. `node scripts/download-sprites.mjs` 下載新圖
4. commit 全部(含 `public/sprites/` 跟 `creatures.ts`)

換掉舊角色:同上但移除舊 entry + `rm public/sprites/<舊 id>.png`。

---

## 5. 歷史紀錄(已棄用)

下面這些功能曾經存在,目前不用,但程式還在 repo,沒清掉純粹方便日後想復活:

- `scripts/gen-art-prompts.mjs`:產生山海經 4 frame(idle/walk/asc/corrupt)的 MJ prompt 用。當前單一立繪流程不需要。
- `petSprite.ts` 內 `selectFrame` / 多 frame 機制:之前留的 hook,目前 `art:true` 一個物種一張立繪,沒有多 frame 切換。
- 場景米紙底 `#efe6cf`、印章風 PWA icon:跟新主題稍微出戲(新主題偏星空玄幻),之後若要重做主視覺再改。
