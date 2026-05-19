# Jaitang Mobile — Roadmap

> สถานะ ณ 2026-05-19 หลังจบ Accounts CRUD (#1) และ Budgets (#2) ใน mobile repo
>
> ลำดับนี้คือสิ่งที่จะทำต่อไป จัดเรียงตามที่ตกลงในแชต:
> 1. ✅ Accounts CRUD (เสร็จ)
> 2. ✅ Budgets (เสร็จ)
> 3. ⏭ Calendar heatmap
> 4. Transfers + multi-currency
> 5. Goals / Loans

---

## ✅ #1 Accounts CRUD — ส่งเรียบร้อย

ฟีเจอร์
- หน้า `accounts.tsx` — สร้าง / แก้ / เก็บเข้าคลัง / ลบ
- ประเภทบัญชี: เงินสด / ธนาคาร / บัตรเครดิต / อีวอลเล็ต
- คำนวณยอดคงเหลือจริงจาก `initial_balance + Σ income − Σ expense`
- Account picker ในหน้า quick + edit transaction
- เพิ่ม row ในเมนู More

ไฟล์หลัก
- `sql/accounts-rpc.sql` (รันบน Supabase แล้ว)
- `lib/queries/accounts.ts`, `lib/sync/accounts.ts`, `lib/db/accounts.ts`
- `app/(app)/accounts.tsx`

---

## ✅ #2 Budgets — ส่งเรียบร้อย

**เป้าหมาย**
ตั้งงบรายเดือนต่อหมวด (parent category) แล้วแสดงเปอร์เซ็นต์ที่ใช้ไปบนหน้าหลัก เพื่อให้ user เห็นทันทีว่าหมวดไหนใกล้เกิน

**Scope**
- หน้า `app/(app)/budgets.tsx` — list งบทั้งหมด + ตั้งใหม่ + แก้ + ลบ
- ตั้งงบต่อหมวดหลักเท่านั้น (sub-category รวบยอดเข้าหมวดแม่)
- มุมมอง: เดือนปัจจุบัน + เลือกย้อน/หน้า
- Visual: progress bar ในแต่ละการ์ด (เขียว → ส้ม → แดง ตามเปอร์เซ็นต์)
- Dashboard mood line — un-mock ตัวเลข 42k โดยใช้งบรวมจริง

**Backend**
- Table `budgets` มีบนเว็บแล้ว (`ledger_id, category_id, amount, period`)
- SQL: `create_budget`, `update_budget`, `delete_budget` (SECURITY DEFINER, pattern เดียวกับ accounts)
- Local mirror: เพิ่ม `budgets` table ใน SQLite schema v5

**Sub-tasks**
- [x] เพิ่ม budgets schema ใน local DB (v5 migration)
- [x] `lib/sync/budgets.ts` + pull-only mirror
- [x] `lib/queries/budgets.ts` + computed `useCategorySpend(monthStart, ledgerId)` → Map<categoryId, sumExpense>
- [x] `sql/budgets-rpc.sql`
- [x] `app/(app)/budgets.tsx`
- [x] Dashboard mood line ใช้ budgets จริง
- [x] Insights screen แสดง over/under budget per category

**ค่าประมาณ**: 1 session

ไฟล์หลัก
- `sql/budgets-rpc.sql`
- `lib/db/budgets.ts`, `lib/sync/budgets.ts`, `lib/queries/budgets.ts`
- `app/(app)/budgets.tsx`
- `app/(app)/dashboard.tsx`, `app/(app)/insights.tsx`

---

## ⏭ #3 Calendar heatmap

**เป้าหมาย**
หน้าใหม่แสดง grid 7×~6 (mon-sun × week) ของเดือนปัจจุบัน สีในแต่ละช่องคือความเข้มของรายจ่ายในวันนั้น แตะดูรายการทั้งวันได้

**Scope**
- หน้า `app/(app)/calendar.tsx`
- Time zone: Bangkok (ตรงกับเว็บ)
- เลือกเดือนย้อน/หน้าด้วย header arrows
- สีตามรายจ่ายรวมต่อวัน: เทาอ่อน → accent (อ่อน-เข้ม)
- แตะวัน → เปิด modal โชว์รายการทั้งวัน + ปุ่ม "ดูใน transactions" → push พร้อม date filter
- ปุ่ม CTA "เพิ่มรายการวันนี้" ในวันปัจจุบัน

**Notes**
- ใช้ข้อมูลจาก local SQLite ทั้งหมด — ไม่ต้องเพิ่ม backend
- SQL aggregate: `SELECT date(occurred_at), SUM(amount) GROUP BY date(occurred_at) WHERE ledger_id=?`
- เพิ่มเข้า more menu, ไม่อยู่ใน tab bar
- Animation: Reanimated FadeIn ทีละช่อง stagger ~20ms

**ค่าประมาณ**: 1 session

---

## #4 Transfers + Multi-currency

**เป้าหมาย**
- รองรับการโอนเงินระหว่างบัญชี (cash → bank, bank → e-wallet) โดยไม่ถือว่าเป็นรายรับ/จ่าย
- รองรับสกุลเงินอื่น (เช่น JPY ตอนไปเที่ยวญี่ปุ่น) — เก็บ `fx_currency`, `fx_amount`, `fx_rate` แล้วแสดงทั้งสองยอด

**Scope**
- หน้า `app/(app)/transfers.tsx` หรือ modal — เลือก from → to, ใส่ยอดต้นทาง + ปลายทาง (auto-calc rate)
- Table `transfers` มีบนเว็บแล้ว
- รายการ transfer แสดงในหน้า transactions ด้วยไอคอน ↔ พิเศษ
- ใน quick.tsx + edit-transaction.tsx: เพิ่มฟิลด์ "สกุลเงิน" แบบ optional
- FX rate lookup: ใช้ Frankfurter.dev API (ตรงกับเว็บ) — cache ใน AsyncStorage 24h
- Account balance — รองรับยอดในสกุลต่างๆ (ตอนนี้ฮาร์ดโค้ดเป็น ฿)

**Sub-tasks**
- [ ] `sql/transfers-rpc.sql` — `create_transfer`, `update_transfer`, `delete_transfer`
- [ ] Local mirror สำหรับ transfers
- [ ] `lib/fx.ts` — fetch + cache rates
- [ ] หน้า transfers
- [ ] รวม transfers เข้า transactions list view (เป็น row พิเศษ)
- [ ] Currency picker ใน quick + edit-transaction
- [ ] Account balance per currency

**ค่าประมาณ**: 2 sessions (เป็นฟีเจอร์หลายชั้น)

---

## #5 Goals / Loans

**เป้าหมาย**
- Goals — ตั้งเป้าหมายออม (เช่น เก็บเงินไป Japan 50,000 ภายใน ธ.ค.) มี progress bar + log การเติม
- Loans — ใครยืมเราเท่าไหร่ / เรายืมใครเท่าไหร่ + ผ่อนรายงวด

**Scope — Goals**
- หน้า `app/(app)/goals.tsx` + `goals/[id].tsx` (detail)
- Field: name, icon, color, target_amount, deadline, archived
- Contribution log table `goal_contributions` — เพิ่มเงินเข้าเป้าหมาย (แยกจาก transactions)
- Visual: ring progress + countdown deadline
- Dashboard card "เป้าหมายที่ใกล้สำเร็จ"

**Scope — Loans**
- หน้า `app/(app)/loans.tsx` + `loans/[id].tsx`
- Field: kind (lent/borrowed), counterparty, principal, currency, started_at, due_date, status, note
- Repayment log table `loan_repayments`
- Summary: รวมยอด lent − borrowed = net position

**Backend**
- Tables มีบนเว็บแล้ว
- ต้องเขียน RPCs: `create_goal`, `update_goal`, `add_goal_contribution`, `set_goal_archived`, `delete_goal`
- เช่นเดียวกัน: `create_loan`, `update_loan`, `add_loan_repayment`, `delete_loan`

**ค่าประมาณ**: 2 sessions (1 สำหรับ Goals, 1 สำหรับ Loans)

---

## ลำดับถัดไป (deferred — ไม่ได้อยู่ใน 1–5)

### Sync / infrastructure
- **Phase E** — Push path generalization สำหรับ categories / accounts / ledgers (ตอนนี้ใช้ RPC ตรง — ทำงานได้แต่ไม่ตรง pattern transactions)
- **Supabase Google OAuth config** — เพิ่ม `jaitang://` ใน redirect URIs

### Analytics
- **Streak counter จริง** — server-side daily streak (un-mock จาก 12)
- **AI monthly summary** — Claude Haiku สรุปเดือนเป็นภาษาไทย/อังกฤษ
- **Year report + PDF export**

### Productivity
- **AI chat assistant** — ถามตอบเรื่องการใช้จ่าย
- **Fast-type parser** — "ค่ากาแฟ 65" → auto-pick หมวด + amount
- **Receipt OCR** — สแกนใบเสร็จ/สลิป
- **Bill splits / Balances** — Splitwise-style

### Polish
- **App icon + splash screen** — ตอนนี้ใช้ Expo default
- **Empty states** ทุกหน้า
- **Drag-and-drop dashboard widget reorder**
- **Push notifications** — เตือนบิลรายเดือน, แจ้งกิจกรรมในสมุดร่วม
- **CSV/JSON import + backup**

---

## หลัก Engineering ที่ต้องไม่ลืม

- ทุก mutation ต้อง refresh + invalidate React Query (ดู accounts.ts เป็นต้นแบบ)
- ทุก SQL function: `SECURITY DEFINER` + เช็ค `auth.uid()` กับ `ledger_members` เอง
- enum casts: `p_kind::tx_kind`, `p_period::recur_period`, etc.
- Local SQLite migrations: bump version ใน `lib/db/schema.ts` + เขียน `ALTER TABLE` block
- Sequential awaits ใน SyncProvider (ห้าม Promise.all ของ pull* functions — concurrent transaction error)
- Git commit identity: ใช้ explicit `-c user.name='...' -c user.email='...'` ห้ามแก้ global config
