import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Github, Mail, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/store/authStore";
import heroImage from "@assets/generated_images/3d_floating_futuristic_chatbot_robot_head.png";

export default function SignupPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");

  const { signup, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError("");

    if (password !== confirmPassword) {
      setValidationError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters");
      return;
    }

    const success = await signup(email, password);
    if (success) {
      navigate("/dashboard");
    }
  };

  const displayError = validationError || error;

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 p-8 flex items-center justify-center relative">
        <div className="absolute top-8 left-8">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <span>ConvoAI</span>
          </Link>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Create Account</h1>
            <p className="text-muted-foreground">Get started with your free account today.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <Button variant="outline" className="h-12 border-white/10 hover:bg-white/5" disabled>
              <Github className="mr-2 h-5 w-5" /> GitHub
            </Button>
            <Button variant="outline" className="h-12 border-white/10 hover:bg-white/5" disabled>
              <Mail className="mr-2 h-5 w-5" /> Google
            </Button>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          {displayError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                className="h-12 bg-white/5 border-white/10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                className="h-12 bg-white/5 border-white/10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                className="h-12 bg-white/5 border-white/10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 btn-gradient text-lg mt-6"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side - Visual */}
      <div className="hidden lg:flex w-1/2 bg-card relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="relative z-10 p-12 text-center">
          <img
            src={heroImage}
            alt="AI Visual"
            className="w-[400px] mx-auto mb-8 animate-[float_6s_ease-in-out_infinite] drop-shadow-2xl"
          />
          <h2 className="text-4xl font-bold mb-4">Start Building Today</h2>
          <p className="text-xl text-muted-foreground max-w-md mx-auto">
            Create your first AI chatbot in minutes. No credit card required.
          </p>
        </div>
      </div>
    </div>
  );
}
