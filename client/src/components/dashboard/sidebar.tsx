import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Bot, LayoutDashboard, Settings, MessageSquare, Plus, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/clerk-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
  { icon: Bot, label: "My Chatbots", href: "/dashboard/chatbots" },
  { icon: MessageSquare, label: "Conversations", href: "/dashboard/conversations" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
];

export function Sidebar() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Mobile hamburger button
  if (isMobile) {
    return (
      <>
        {/* Mobile header bar */}
        <div className="fixed top-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-xl border-b border-white/5 z-50 flex items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <span>ConvoAI</span>
          </Link>
          <div className="flex items-center gap-3">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="h-10 w-10"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-40"
                onClick={closeMobileMenu}
              />

              {/* Menu panel */}
              <motion.aside
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed top-16 right-0 bottom-0 w-72 bg-card/95 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col"
              >
                <div className="p-4">
                  <Link href="/dashboard/create" onClick={closeMobileMenu}>
                    <Button className="w-full btn-gradient gap-2">
                      <Plus className="h-4 w-4" /> New Chatbot
                    </Button>
                  </Link>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                  {navItems.map((item) => (
                    <Link key={item.href} href={item.href} onClick={closeMobileMenu}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer",
                          location === item.href
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                    </Link>
                  ))}
                </nav>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Spacer for fixed header */}
        <div className="h-16" />
      </>
    );
  }

  // Desktop sidebar
  return (
    <aside className="w-64 border-r border-white/5 bg-card/30 backdrop-blur-xl h-screen flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
            <Bot className="h-5 w-5" />
          </div>
          <span>ConvoAI</span>
        </Link>
      </div>

      <div className="px-4 mb-6">
        <Link href="/dashboard/create">
          <Button className="w-full btn-gradient gap-2">
            <Plus className="h-4 w-4" /> New Chatbot
          </Button>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer",
                location === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </div>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-white/5 flex items-center gap-3">
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: "w-10 h-10",
            },
          }}
        />
        <span className="text-sm text-muted-foreground">Account</span>
      </div>
    </aside>
  );
}
