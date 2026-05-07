# 美術立繪總表

> **本文件當前用途**:管理 20 隻角色的立繪 URL + 下載流程。
> **歷史紀錄**:之前山海經 40 隻 → 20 隻、idle/asc/corrupt 三 frame 機制等
> 都已棄用。最後一版 git history 在 commit `2f9af58` 之前。
> 現採「**單一立繪 + 進化用光環顏色 + 黑化用 tint**」最簡架構。

---

## 1. 角色 + 立繪 URL 對照表

50 隻全部從 Midjourney 跑出來。`id` 對應 `src/data/creatures.ts` 的 species id,也對應下載後的檔名 `public/sprites/<id>.png`。

| # | id | 中文 | 陣營 | 立繪 URL |
|---|---|---|---|---|
| 1 | `tai-chu-yan-jun` | 太初炎君 | 天界 | https://cdn.midjourney.com/212042ac-d5d6-4ec6-bd44-421470d692b2/0_1.png |
| 2 | `tai-su-xuan-lu` | 太素玄鹿 | 天界 | https://cdn.midjourney.com/11a7fbe7-41d9-44c2-9a9b-c25456cf78f3/0_1.png |
| 3 | `wu-shi-zhi-die` | 無始之蝶 | 夢境界 | https://cdn.midjourney.com/5ff76581-cfde-4708-a7cc-bdf3974a9629/0_1.png |
| 4 | `wu-ji-jin-zun` | 無極金尊 | 佛界 | https://cdn.midjourney.com/8920a195-eb9f-4b19-a162-fc7101bb8bda/0_0.png |
| 5 | `ji-zhi-ming` | 寂之鳴 | 天界 | https://cdn.midjourney.com/25e7213c-3226-4403-afdd-5f747f2858f8/0_0.png |
| 6 | `tai-xuan-zhi-zhu` | 太玄之主 | 冥界 | https://cdn.midjourney.com/f52b6d34-f0e9-4026-a2fb-1e676acb49b5/0_0.png |
| 7 | `yuan-shi-lei-ting` | 原始雷霆 | 天界 | https://cdn.midjourney.com/f8fa0943-e5e1-41a5-b498-b03c67912763/0_2.png |
| 8 | `wu-zi-zhi-long` | 無字之龍 | 天界 | https://cdn.midjourney.com/f432ce0b-22c1-485c-8b3b-ae66c2a7c660/0_0.png |
| 9 | `heng-chun-zhi-gui` | 恆春之龜 | 自然界 | https://cdn.midjourney.com/8a360c16-a4d9-4981-8b7c-abcc7c8daae5/0_1.png |
| 10 | `wu-xiang-zhi-hu` | 無相之狐 | 天界 | https://cdn.midjourney.com/d91f8cf2-b1f5-43cc-b960-73b001775566/0_2.png |
| 11 | `hong-meng-xue-huang` | 鴻濛血皇 | 魔界 | https://cdn.midjourney.com/8b205bc9-6228-4b86-b355-8b29efe450ef/0_3.png |
| 12 | `tai-bai-jian-xian` | 太白劍仙 | 天界 | https://cdn.midjourney.com/3f059007-e6c2-4654-91af-4793e9a49c0a/0_2.png |
| 13 | `xuan-huang-di-mu` | 玄黃地母 | 自然界 | https://cdn.midjourney.com/5c931713-b5f7-472c-882b-2a1f5f5cc7f3/0_0.png |
| 14 | `cang-ming-hai-zun` | 滄溟海尊 | 海界 | https://cdn.midjourney.com/5688eb6a-b07c-49a2-bb2f-ccb10d7ca70f/0_2.png |
| 15 | `huang-quan-meng-po` | 黃泉孟婆 | 冥界 | https://cdn.midjourney.com/62c6855e-9c86-4dd9-899a-4629d7b576d9/0_2.png |
| 16 | `zi-wei-tian-shu` | 紫微天樞 | 天界 | https://cdn.midjourney.com/c0626ec1-848e-450d-8678-a0f2a525d2f0/0_1.png |
| 17 | `hong-meng-qin-zun` | 鴻蒙琴尊 | 天界 | https://cdn.midjourney.com/1be5bfc3-7de8-4ae7-b06d-e5806795b1ba/0_0.png |
| 18 | `ye-huo-luo-cha` | 業火羅剎 | 魔界 | https://cdn.midjourney.com/ff89bb44-e2e4-4ea1-8be4-ee84dc86db56/0_1.png |
| 19 | `tai-xu-jing-jun` | 太虛鏡君 | 虛無界 | https://cdn.midjourney.com/0bd617ba-e13c-48c1-bdbb-56c8917ecb89/0_1.png |
| 20 | `hong-jun-dao-zu` | 鴻鈞道祖 | 天界 | https://cdn.midjourney.com/8dda7333-193f-446c-8d8a-b11685103c72/0_0.png |
| 21 | `zhu-long-you-ming` | 燭龍幽冥 | 天界 | https://cdn.midjourney.com/c0af6ce9-03b4-410d-ad78-2177dd599b88/0_2.png |
| 22 | `shi-tian-tao-tie` | 噬天饕餮 | 魔界 | https://cdn.midjourney.com/0e5c5b95-2585-428c-a55c-6f9a0e4844b7/0_3.png |
| 23 | `cui-yu-luan-wang` | 翠羽鸞王 | 自然界 | https://cdn.midjourney.com/89e72905-c687-4f02-a16b-5db2f9345c07/0_3.png |
| 24 | `xuan-wu-bu-dong` | 玄武不動 | 天界 | https://cdn.midjourney.com/4883a37f-9da2-4dc3-b305-245a7530e079/0_3.png |
| 25 | `lie-yang-huo-hou` | 烈陽火犼 | 魔界 | https://cdn.midjourney.com/3ce7f09e-4b2f-47b9-a1d1-d8469df0327c/0_0.png |
| 26 | `xue-po-bai-hu` | 雪魄白虎 | 天界 | https://cdn.midjourney.com/fa494098-039b-4d3f-8a0e-b1f16d7c30ae/0_1.png |
| 27 | `zhu-que-nie-pan` | 朱雀涅槃 | 天界 | https://cdn.midjourney.com/f4e64d62-e1a7-4a8d-8439-e8aaf9040147/0_2.png |
| 28 | `qing-long-yu-hai` | 青龍御海 | 天界 | https://cdn.midjourney.com/77b4344d-d16d-494d-902c-6783df0083bf/0_2.png |
| 29 | `huang-lin-zhen-zhong` | 黃麟鎮中 | 天界 | https://cdn.midjourney.com/400421d4-0748-4f1d-8f53-467e189a8015/0_1.png |
| 30 | `jing-ge-shen-yuan` | 鯨歌深淵 | 海界 | https://cdn.midjourney.com/c24baf43-9a56-4be8-ba57-49be36c3e000/0_0.png |
| 31 | `shan-jun-ban-lan` | 山君斑斕 | 自然界 | https://cdn.midjourney.com/f89d9976-856e-464d-a57e-158e62b5c51a/0_2.png |
| 32 | `yin-yue-tian-lang` | 銀月天狼 | 夜界 | https://cdn.midjourney.com/54906f93-26f8-4187-ace8-6f2ddba7d530/0_3.png |
| 33 | `shi-ri-jin-wu` | 蝕日金烏 | 天界 | https://cdn.midjourney.com/0e1fc8bd-ab8c-4fc0-a3bb-36431a72d299/0_1.png |
| 34 | `yu-tu-dao-yao` | 玉兔搗藥 | 月宮 | https://cdn.midjourney.com/9a242fdc-9f47-4c53-90c0-ad21100ebc31/0_2.png |
| 35 | `lei-ze-ying-long` | 雷澤應龍 | 天界 | https://cdn.midjourney.com/43903d94-bdf8-463a-a79b-2360c30c0f73/0_0.png |
| 36 | `shen-lou-hai-yao` | 蜃樓海妖 | 海界 | https://cdn.midjourney.com/d1986531-a4c1-4996-8139-c71b29459dc3/0_1.png |
| 37 | `shen-shu-yu-lei` | 神荼鬱壘 | 人界 | https://cdn.midjourney.com/d9dc12c9-8ec7-4e7e-b1cc-e6365f955106/0_0.png |
| 38 | `gu-chong-du-zun` | 蠱蟲毒尊 | 魔界 | https://cdn.midjourney.com/8f70fd68-1b3c-485d-b820-fbebf07442a3/0_2.png |
| 39 | `fen-tian-xie-hou` | 焚天蠍后 | 魔界 | https://cdn.midjourney.com/67232df2-e196-4367-bd32-192ea8b4d78f/0_1.png |
| 40 | `han-yuan-bing-mang` | 寒淵冰蟒 | 極北 | https://cdn.midjourney.com/76e2f9c7-38fb-4233-a4ab-f9e8eb960eeb/0_3.png |
| 41 | `lin-lu-qian-nian` | 林鹿千年 | 自然界 | https://cdn.midjourney.com/75ea804a-44cb-43ff-b645-077124faf959/0_3.png |
| 42 | `feng-huo-zhan-shi` | 烽火戰豕 | 魔界 | https://cdn.midjourney.com/ae7673cf-4be2-428a-8a00-79fb3bfb5c95/0_3.png |
| 43 | `wan-she-jiu-ying` | 萬蛇九嬰 | 魔界 | https://cdn.midjourney.com/75dfae1d-5cf4-4a8e-9e1d-706812d5a017/0_3.png |
| 44 | `tao-yuan-xian-yuan` | 桃源仙猿 | 天界 | https://cdn.midjourney.com/dab8ed2e-01dc-45da-9fd4-f5a4cf3479fb/0_2.png |
| 45 | `yun-hai-cang-ying` | 雲海蒼鷹 | 天界 | https://cdn.midjourney.com/3a10375b-3ba3-4fb9-b073-7a7ca256234c/0_1.png |
| 46 | `liu-li-hua-she` | 琉璃化蛇 | 天界 | https://cdn.midjourney.com/05e85a6d-d1da-408c-8388-e2a857b46ff0/0_2.png |
| 47 | `gu-hun-ku-shou` | 骨魂枯獸 | 冥界 | https://cdn.midjourney.com/14f14011-746a-4d80-b4a0-c89a9532dc02/0_3.png |
| 48 | `xin-mo-shi-ying` | 心魔噬影 | 心魔界 | https://cdn.midjourney.com/94dcab9e-a17f-4257-808a-34cad81e074b/0_3.png |
| 49 | `lian-hua-jing-shi` | 蓮華淨世 | 佛界 | https://cdn.midjourney.com/4c76f26e-855c-4568-847c-9cb86409db21/0_2.png |
| 50 | `tai-ji-liang-yi-shou` | 太極兩儀獸 | 道界 | https://cdn.midjourney.com/de23d0c4-5a92-4771-9278-29ae9e2581b8/0_2.png |

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
