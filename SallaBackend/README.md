# Laveen Abaya × Salla API Backend

هذا السيرفر هو الطبقة الآمنة بين تطبيق iOS و Salla Merchant API.
لا تضع `client_secret` أو `access_token` داخل تطبيق iOS.

## التشغيل المحلي

```bash
cd SallaBackend
npm install
cp .env.example .env
# عدّل SALLA_ACCESS_TOKEN و FIREBASE_SERVICE_ACCOUNT_PATH
npm run dev
```

## ربط iOS

في `Laveen Abaya/Info.plist` غيّر:

```xml
<key>LAVEEN_API_BASE_URL</key>
<string>https://your-backend-domain.com</string>
```

## Endpoints

- `GET /api/salla/products`
- `GET /api/salla/categories`
- `POST /api/checkout`

كل الطلبات من iOS تتطلب Firebase ID Token في الهيدر:

```http
Authorization: Bearer <Firebase ID Token>
```

## صلاحيات Salla المطلوبة

- `orders.read_write` لإنشاء الطلبات.
- `products.read` أو صلاحية المنتجات المناسبة لجلب المنتجات.
- `categories.read` أو صلاحية التصنيفات المناسبة لجلب التصنيفات.

## ملاحظة مهمة

لأن Salla OAuth يعطي Access Token لمدة محدودة، الأفضل في الإنتاج تخزين `refresh_token` في قاعدة بيانات السيرفر وتجديد التوكن تلقائيًا. هذا القالب يستخدم `SALLA_ACCESS_TOKEN` مباشرة كبداية عملية وسريعة.
