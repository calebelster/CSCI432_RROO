// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDj1Auh9FdwGJ5Ddds04REZVrafnWQqM-I",
    authDomain: "dental-soap.firebaseapp.com",
    projectId: "dental-soap",
    storageBucket: "dental-soap.firebasestorage.app",
    messagingSenderId: "90344869822",
    appId: "1:90344869822:web:7d532c57ff86b27fbbb3ef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };