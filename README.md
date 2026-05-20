# 洪小花打卡系統

正式版 PWA 打卡系統。前端可部署在 GitHub Pages / Cloudflare Pages / Firebase Hosting，登入、員工資料、打卡、請假、HR 查詢與打卡範圍設定可由 Supabase 後端儲存。

目前若 `config.js` 尚未填入 Supabase URL 與 anon key，系統會自動進入試用模式，方便先給對方打開網頁體驗。

## 正式版架構

```text
員工手機 PWA
  -> Supabase Auth 驗證工號密碼
  -> Supabase Postgres 儲存打卡、請假、定位與 HR 設定
  -> Row Level Security 控制員工只能看自己的資料，HR 可看全公司資料
```

## 功能

- 工號密碼登入，前端不再保存密碼清單
- 上班打卡與下班打卡
- 定位打卡範圍限制
- 打卡成功後直接顯示 Google 地圖打卡位置
- 請假申請與假別統計
- HR 後台建立/更新員工帳號、查詢全員紀錄、匯出 CSV
- HR 設定公司打卡中心點與允許半徑

## 試用模式

不設定 Supabase 也可以直接打開網頁試用：

```text
員工：A001 / 1234
員工：A002 / 2222
HR：HR0001 / hr1234
```

試用模式資料會暫存在同一台裝置的瀏覽器 `localStorage`，包含員工帳號、打卡紀錄、請假紀錄與打卡範圍。換裝置、換瀏覽器或清除瀏覽資料後，資料不會同步或保留。

正式給公司多人使用時，請完成下方 Supabase 設定，系統會自動切換成正式資料庫模式。

## 本機開啟

```bash
python3 -m http.server 4173
```

再開啟：

```text
http://127.0.0.1:4173/index.html
```

## Supabase 設定

1. 建立 Supabase 專案。
2. 到 SQL Editor 執行 `supabase/schema.sql`。
3. 部署 HR 員工帳號管理 Edge Function：

```bash
supabase functions deploy admin-upsert-employee
```

4. 先到 Authentication 建立第一個 HR 使用者。
   - 工號 `A001` 對應 email：`a001@hong-xiao-hua.local`
   - HR `HR0001` 對應 email：`hr0001@hong-xiao-hua.local`
5. 到 Table Editor 的 `profiles` 建立第一個 HR 對應資料：

```text
id = auth.users 的 user id
employee_id = HR0001
full_name = HR 管理員
role = hr
is_active = true
```

6. 到 Supabase Project Settings > API 複製 Project URL 與 anon/publishable key，填入 `config.js`：

```js
window.HH_CLOCK_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "你的 anon 或 publishable key",
  authEmailDomain: "hong-xiao-hua.local",
};
```

`supabaseAnonKey` 可以放在前端，但必須搭配 `supabase/schema.sql` 的 RLS 規則。不要把 service role key 放進前端。

## HR 後台

HR 登入後會看到「HR」頁籤，裡面包含：

- 員工帳號設定：新增員工、更新姓名、角色、啟用狀態、重設密碼
- 打卡範圍設定：設定中心點與允許半徑
- 本機彙整紀錄：查詢全員本月打卡與請假
- 匯出全部 CSV

員工帳號設定會呼叫 `supabase/functions/admin-upsert-employee`。此功能需要 Supabase Edge Function 的 service role 環境變數；不要把 service role key 放在前端。

## 商用注意

- 打卡定位屬於員工個資，正式使用前應提供隱私告知、用途、保存期限與查閱權限說明。
- Google 地圖嵌入會把打卡座標傳給 Google Maps 以載入地圖。
- HR 員工帳號管理透過 Supabase Edge Function 使用 service role 建立 Auth 使用者，前端不可保存 service role key。
