# 洪小花打卡系統

正式版 PWA 打卡系統。前端可部署在 GitHub Pages / Cloudflare Pages / Firebase Hosting，登入、員工資料、打卡、請假、HR 查詢與打卡範圍設定改由 Supabase 後端儲存。

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
- HR 後台查詢全員紀錄、匯出 CSV
- HR 設定公司打卡中心點與允許半徑

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
3. 到 Authentication 建立使用者。
   - 工號 `A001` 對應 email：`a001@hong-xiao-hua.local`
   - HR `HR0001` 對應 email：`hr0001@hong-xiao-hua.local`
4. 到 Table Editor 的 `profiles` 建立對應資料：

```text
id = auth.users 的 user id
employee_id = A001
full_name = 洪小花
role = employee 或 hr
is_active = true
```

5. 到 Supabase Project Settings > API 複製 Project URL 與 anon/publishable key，填入 `config.js`：

```js
window.HH_CLOCK_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "你的 anon 或 publishable key",
  authEmailDomain: "hong-xiao-hua.local",
};
```

`supabaseAnonKey` 可以放在前端，但必須搭配 `supabase/schema.sql` 的 RLS 規則。不要把 service role key 放進前端。

## 商用注意

- 打卡定位屬於員工個資，正式使用前應提供隱私告知、用途、保存期限與查閱權限說明。
- Google 地圖嵌入會把打卡座標傳給 Google Maps 以載入地圖。
- 若要讓 HR 在系統內直接新增/停用員工帳號，建議再加 Supabase Edge Function，由後端使用 service role 建立 Auth 使用者，前端不可保存 service role key。
