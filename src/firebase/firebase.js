// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB7MDnqZ3lQs6c62GYzGxHSfx0p7HkyXO0",
    authDomain: "rror-e48ab.firebaseapp.com",
    projectId: "rror-e48ab",
    storageBucket: "rror-e48ab.appspot.com",
    messagingSenderId: "727045474587",
    appId: "1:727045474587:web:4d26f42c2dd42042896bbe"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };