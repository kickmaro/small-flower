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

## 4. 系統內 HR 後台

HR 登入後，系統內的 `HR` 頁籤就是正式後台。功能包含：

- 員工帳號設定
- 打卡範圍設定
- 全員打卡/請假紀錄查詢
- CSV 匯出

員工帳號設定會呼叫 `admin-upsert-employee` Edge Function。

## 5. 部署員工管理 Edge Function

安裝並登入 Supabase CLI 後，在專案目錄執行：

```bash
supabase link --project-ref your-project-ref
supabase secrets set AUTH_EMAIL_DOMAIN=hong-xiao-hua.local
supabase functions deploy admin-upsert-employee
```

service role key 只能存在 Edge Function 環境變數，不能放進 `config.js` 或任何前端檔案。

部署後，HR 可在系統的 HR 後台輸入工號、姓名、角色、初始密碼來建立員工。若點選員工列表中的既有員工，表單會帶入資料，可更新角色、啟用狀態或輸入新密碼重設密碼。
