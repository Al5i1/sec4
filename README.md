# 🚀 دليل التثبيت

## الخطوة 1 — تحميل وتثبيت Laragon

1. حمّل Laragon من الرابط:
   **https://github.com/leokhoa/laragon/releases/latest/download/laragon-wamp.exe**

2. شغّل الملف وثبّته (Next → Next → Install)

3. بعد التثبيت افتح **Laragon** ثم اضغط **Start All**

---

## الخطوة 2 — ضع المشروع في المكان الصح

انقل مجلد `sec4` كاملاً داخل:
```
C:\laragon\www\sec4\
```

---

## الخطوة 3 — أنشئ قاعدة البيانات تلقائياً

افتح المتصفح وادخل:
```
http://localhost/sec4/setup.php
```

---

## الخطوة 4 — افتح الموقع

افتح المتصفح وادخل:
```
http://localhost/sec4/html/index.html
```

---

## 🔑 بيانات حساب الـ Admin الافتراضي

| الحقل    | القيمة           |
|----------|-----------------|
| البريد   | admin@admin.com |
| الهاتف   | +97330000000 (أو اختر 🇧🇭 واكتب 30000000) |
| كلمة المرور | Admin@1234   |

> بعد الدخول ترح تنقلك تلقائياً للوحة التحكم

---

## 📁 هيكلة المشروع

```
test/
├── api/
│   ├── login.php       ← تسجيل الدخول
│   ├── register.php    ← إنشاء حساب
│   └── users.php       ← إدارة المستخدمين (Admin فقط)
├── config/
│   └── db.php          ← إعدادات قاعدة البيانات
├── css/
│   ├── main.css
│   ├── login.css
│   └── register.css
├── html/
│   ├── index.html      ← تسجيل الدخول
│   ├── register.html   ← إنشاء حساب
│   └── admin.html      ← لوحة التحكم
├── js/
│   ├── i18n.js         ← النصوص (عربي/إنجليزي)
│   ├── app.js          ← اللغة والوضع
│   └── auth.js         ← التواصل مع API
└── database.sql        ← سكريبت قاعدة البيانات
```
