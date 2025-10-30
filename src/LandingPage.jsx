import React from "react";
import { Link } from "react-router-dom";
import { Button } from "./components/ui/button";  // Adjust path according to your setup
import { Card } from "./components/ui/card";
import styles from "./LandingPage.module.css";   // Optional for some custom CSS

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Navbar */}
            <nav className="bg-blue-900 text-white flex justify-between items-center p-6 shadow-md">
                <div className="flex items-center space-x-3">
                    <img src="../public/gavel_logo.png" alt="Logo" className="h-10 invert" />
                    <span className="text-2xl font-bold">Robert's Rules of Order</span>
                </div>
                <div className="space-x-4">
                    <Button asChild variant="ghost">
                        <Link to="/login">Log In</Link>
                    </Button>
                    <Button asChild>
                        <Link to="/signup">Sign Up</Link>
                    </Button>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="flex flex-col flex-1 items-center justify-center py-20 px-4 text-center max-w-5xl mx-auto">
                <h1 className="text-5xl font-extrabold text-blue-900 mb-5">
                    Modern Meetings
                </h1>
                <p className="text-xl text-blue-700 mb-10 max-w-prose">
                    Conduct effective, fair, and orderly meetings using digital tools built around Robert's Rules of Order. Perfect for committees, boards, and organizations.
                </p>
                <div className="flex space-x-6">
                    <Button asChild>
                        <Link to="/login">Log In</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link to="/signup">Sign Up</Link>
                    </Button>
                </div>

                {/* Info Grid with Cards */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mt-20 w-full">
                    {[
                        {
                            title: "What is Robert’s Rules?",
                            description: "A widely used framework for running meetings—ensuring fair, democratic decision-making and clear procedures for groups of all sizes."
                        },
                        {
                            title: "How Motions Work",
                            description: "Members propose ideas (motions), discuss merits, and vote—typical process starts with, 'I move that...'."
                        },
                        {
                            title: "Debate Principles",
                            description: "Meetings protect majority and minority rights, allow one speaker at a time, aiming for group consensus."
                        },
                        {
                            title: "Origin Story",
                            description: "Created in 1876 by Henry M. Robert, inspired by public meetings experience, now standard in North America."
                        },
                        {
                            title: "Why Use It?",
                            description: "Streamlines meetings, reduces confusion, and helps organizations make decisions that stick."
                        },
                        {
                            title: "Example Actions",
                            description: "Make, second, discuss motions; amend, postpone, vote. Chair facilitates, group decides."
                        }
                    ].map(({ title, description }) => (
                        <Card key={title} className="p-6 shadow-lg">
                            <h2 className="text-xl font-semibold text-blue-800 mb-2">{title}</h2>
                            <p className="text-gray-700">{description}</p>
                        </Card>
                    ))}
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-blue-900 text-white text-center py-4 mt-auto">
                © 2025 Robert's Rules Meeting App
            </footer>
        </div>
    );
}
