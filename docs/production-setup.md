# 正式版建置流程

## 1. Supabase Auth 帳號

本系統登入畫面仍輸入工號，但程式會把工號轉成 email 交給 Supabase Auth：

```text
A001 -> a001@hong-xiao-hua.local
HR0001 -> hr0001@hong-xiao-hua.local
```

建立帳號時，請在 Supabase Authentication 使用上述 email 建立使用者，並設定密碼。

## 2. profiles 員工資料

每一個 Auth 使用者都要有一筆 `profiles`：

```text
id          Auth user id
employee_id 工號，例如 A001
full_name   姓名
role        employee 或 hr
is_active   true
```

HR 權限由 `profiles.role = 'hr'` 決定。

## 3. 打卡範圍

HR 登入後可在 HR 後台設定：

- 中心緯度
- 中心經度
- 允許半徑（公尺）

員工打卡時必須授權定位，且距離需在半徑內。

## 4. 正式新增員工建議

目前正式版骨架可透過 Supabase Dashboard 建立帳號。若要讓 HR 從系統畫面新增員工，請新增 Supabase Edge Function：

```text
HR 前端 -> Edge Function -> service role 建立 Auth user -> 寫入 profiles
```

service role key 只能存在 Edge Function 環境變數，不能放進 `config.js` 或任何前端檔案。
