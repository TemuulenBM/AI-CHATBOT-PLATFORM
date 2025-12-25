import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@clerk/clerk-react";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChatbotStore } from "@/store/chatbot-store";

interface KnowledgeEntry {
  id: string;
  chatbot_id: string;
  question: string;
  answer: string;
  category: string | null;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  "Pricing",
  "Support",
  "Features",
  "Technical",
  "Billing",
  "General",
];

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "Normal", color: "bg-slate-600" },
  1: { label: "High", color: "bg-amber-500" },
  2: { label: "Critical", color: "bg-red-500" },
};

export default function KnowledgeBase() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();
  const { toast } = useToast();
  const { currentChatbot, fetchChatbot } = useChatbotStore();

  // State
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPriority, setFormPriority] = useState(0);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation("/login");
    }
  }, [isSignedIn, isLoaded, setLocation]);

  useEffect(() => {
    if (id) {
      fetchChatbot(id);
      fetchEntries();
    }
  }, [id, page, categoryFilter, searchQuery]);

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (categoryFilter !== "all") {
        params.append("category", categoryFilter);
      }

      if (searchQuery) {
        params.append("search", searchQuery);
      }

      const response = await fetch(`/api/chatbots/${id}/knowledge?${params}`);
      if (!response.ok) throw new Error("Failed to fetch knowledge entries");

      const data = await response.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load knowledge base entries",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEntry = () => {
    setEditingEntry(null);
    setFormQuestion("");
    setFormAnswer("");
    setFormCategory("");
    setFormPriority(0);
    setIsDialogOpen(true);
  };

  const handleEditEntry = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setFormQuestion(entry.question);
    setFormAnswer(entry.answer);
    setFormCategory(entry.category || "");
    setFormPriority(entry.priority);
    setIsDialogOpen(true);
  };

  const handleSaveEntry = async () => {
    if (!formQuestion.trim() || !formAnswer.trim()) {
      toast({
        title: "Validation Error",
        description: "Question and answer are required",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        question: formQuestion,
        answer: formAnswer,
        category: formCategory || null,
        priority: formPriority,
      };

      const url = editingEntry
        ? `/api/chatbots/${id}/knowledge/${editingEntry.id}`
        : `/api/chatbots/${id}/knowledge`;

      const response = await fetch(url, {
        method: editingEntry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to save entry");

      toast({
        title: "Success",
        description: `Knowledge entry ${editingEntry ? "updated" : "added"} successfully`,
      });

      setIsDialogOpen(false);
      fetchEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${editingEntry ? "update" : "add"} entry`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    try {
      const response = await fetch(`/api/chatbots/${id}/knowledge/${entryId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete entry");

      toast({
        title: "Success",
        description: "Knowledge entry deleted successfully",
      });

      fetchEntries();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete entry",
        variant: "destructive",
      });
    }
  };

  const totalPages = Math.ceil(total / limit);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-72 px-8 pt-8 pb-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation(`/dashboard/chatbots`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Chatbots
            </Button>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Knowledge Base</h1>
                <p className="text-muted-foreground">
                  {currentChatbot?.name ? `Manage Q&A entries for ${currentChatbot.name}` : "Loading..."}
                </p>
              </div>
            </div>
          </header>

          {/* Filters and Add Button */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search questions or answers..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <Select
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAddEntry}
              className="btn-gradient gap-2 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Add Q&A
            </Button>
          </div>

          {/* Entries List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : entries.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
                <BookOpen className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">No knowledge entries yet</h3>
              <p className="text-muted-foreground mb-6">
                Add manual Q&A entries to provide precise answers for common questions
              </p>
              <Button
                onClick={handleAddEntry}
                className="btn-gradient gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Your First Q&A
              </Button>
            </GlassCard>
          ) : (
            <>
              <div className="space-y-4">
                {entries.map((entry) => (
                  <GlassCard key={entry.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.priority > 0 && (
                          <Badge
                            className={`${PRIORITY_LABELS[entry.priority]?.color || PRIORITY_LABELS[0].color} text-white border-0`}
                          >
                            {PRIORITY_LABELS[entry.priority]?.label || "Normal"}
                          </Badge>
                        )}
                        {entry.category && (
                          <Badge variant="outline">
                            {entry.category}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditEntry(entry)}
                          className="hover:bg-white/5"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="hover:bg-red-500/10 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1">QUESTION</div>
                        <p className="text-foreground font-medium">{entry.question}</p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1">ANSWER</div>
                        <p className="text-muted-foreground leading-relaxed">{entry.answer}</p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm px-3">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? "Edit Knowledge Entry" : "Add Knowledge Entry"}
            </DialogTitle>
            <DialogDescription>
              {editingEntry
                ? "Update the question and answer for this knowledge base entry"
                : "Add a new Q&A entry to your knowledge base"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="question">
                Question *
              </Label>
              <Input
                id="question"
                placeholder="What are your pricing plans?"
                value={formQuestion}
                onChange={(e) => setFormQuestion(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="answer">
                Answer *
              </Label>
              <Textarea
                id="answer"
                placeholder="We offer 4 plans: Free ($0), Starter ($29), Growth ($99), and Business ($299). All plans include..."
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">
                  Category
                </Label>
                <Select value={formCategory || undefined} onValueChange={(value) => setFormCategory(value || "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">
                  Priority
                </Label>
                <Select
                  value={formPriority.toString()}
                  onValueChange={(val) => setFormPriority(parseInt(val))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Normal</SelectItem>
                    <SelectItem value="1">High</SelectItem>
                    <SelectItem value="2">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEntry}
              disabled={isSaving}
              className="btn-gradient"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Entry"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
