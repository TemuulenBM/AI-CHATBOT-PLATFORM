import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Github, Mail } from "lucide-react";
import { Link } from "wouter";
import heroImage from "@assets/generated_images/3d_floating_futuristic_chatbot_robot_head.png";

export default function AuthPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 p-8 flex items-center justify-center relative">
        <div className="absolute top-8 left-8">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <span>ChatAI</span>
          </Link>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
            <p className="text-muted-foreground">Enter your credentials to access your account.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <Button variant="outline" className="h-12 border-white/10 hover:bg-white/5">
              <Github className="mr-2 h-5 w-5" /> GitHub
            </Button>
            <Button variant="outline" className="h-12 border-white/10 hover:bg-white/5">
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

          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" placeholder="name@example.com" className="h-12 bg-white/5 border-white/10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" className="h-12 bg-white/5 border-white/10" />
            </div>
            <Button className="w-full h-12 btn-gradient text-lg mt-6">
              Sign In
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline font-medium">
              Sign up
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
          <h2 className="text-4xl font-bold mb-4">Smart Automation</h2>
          <p className="text-xl text-muted-foreground max-w-md mx-auto">
            Join thousands of businesses using ChatAI to streamline customer support.
          </p>
        </div>
      </div>
    </div>
  );
}
