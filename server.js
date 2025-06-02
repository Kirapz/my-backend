require("dotenv").config();
const helmet = require("helmet");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://lab4-4ca1e.web.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "script-src 'self'; " +
    "img-src 'self' data:;"
  );
  next();
});

// const path = require("path");
// app.use("/", express.static(path.join(__dirname, "../my-react-app/build")));

// app.get("*", function (req, res) {
//   res.sendFile(path.resolve(__dirname, "../my-react-app/build", "index.html"));
// });



// Middleware для перевірки токена авторизації
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

app.get("/api/menu", async (req, res) => {
  try {
    const snapshot = await db.collection("menu").get();
    const menuItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(menuItems);
  } catch (error) {
    console.error("Error fetching menu:", error);
    res.status(500).json({ message: "Failed to fetch menu" });
  }
});

// POST /api/orders - створення замовлення з expectedDeliveryTime
app.post("/api/orders", verifyToken, async (req, res) => {
  try {
    const { dishes } = req.body;
    const userId = req.user.uid;

    if (!dishes || !Array.isArray(dishes) || dishes.length < 1 || dishes.length > 10) {
      return res.status(400).json({ error: "Список страв має містити від 1 до 10 елементів" });
    }

    const cleanedDishes = dishes.map((dish) => ({
      name: dish.name || "",
      price: dish.price || 0,
      details: dish.details || "",
    }));

    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    const expectedDeliveryTime = new Date(Date.now() + 30 * 1000); 

    const order = {
      userId,
      dishes: cleanedDishes,
      createdAt,
      expectedDeliveryTime: admin.firestore.Timestamp.fromDate(expectedDeliveryTime),
      status: "processing",
    };

    const docRef = await db.collection("orders").add(order);
    console.log("Замовлення створено з ID:", docRef.id);
    res.status(201).json({ message: "Замовлення створено успішно", orderId: docRef.id });
  } catch (err) {
    console.error("Помилка створення замовлення:", err);
    res.status(500).json({ error: "Помилка створення замовлення" });
  }
});

// GET /api/orders - отримання всіх замовлень з expectedDeliveryTime у мілісекундах
app.get("/api/orders", verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const snapshot = await db
      .collection("orders")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    const orders = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toMillis?.() ?? 0,
        expectedDeliveryTime: data.expectedDeliveryTime?.toMillis?.() ?? 0,
      };
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

// PATCH /api/orders/:id/confirm - підтвердження отримання замовлення
app.patch("/api/orders/:id/confirm", verifyToken, async (req, res) => {
  const orderId = req.params.id;
  try {
    await db.collection("orders").doc(orderId).update({
      status: "received",
    });
    res.json({ status: "received" });
  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).json({ message: "Failed to confirm order" });
  }
});

// Динамічний порт для хостингу
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});