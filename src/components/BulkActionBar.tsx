import { useState } from "react";
import { Tag, FolderPlus, X, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BulkActionBarProps {
  selectedCount: number;
  categories: string[];
  onApply: (category?: string, tags?: string[]) => Promise<void>;
  onUnsubscribe: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  categories,
  onApply,
  onUnsubscribe,
  onClearSelection,
}: BulkActionBarProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [customCategory, setCustomCategory] = useState<string>("");
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState<boolean>(false);

  const [tagInput, setTagInput] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (selectedCount === 0) return null;

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleKeyDownTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleApply = async () => {
    const categoryValue = isCustomCategoryMode ? customCategory.trim() : selectedCategory.trim();
    const categoryToSubmit = categoryValue ? categoryValue : undefined;

    const pendingTag = tagInput.trim();
    const finalTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;
    const tagsToSubmit = finalTags.length > 0 ? finalTags : undefined;

    if (!categoryToSubmit && !tagsToSubmit) return;

    setIsSubmitting(true);
    try {
      await onApply(categoryToSubmit, tagsToSubmit);
      // Reset local state after apply
      setSelectedCategory("");
      setCustomCategory("");
      setIsCustomCategoryMode(false);
      setTags([]);
      setTagInput("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalCategory = isCustomCategoryMode ? customCategory.trim() : selectedCategory.trim();
  const pendingTag = tagInput.trim();
  const canApply = Boolean(finalCategory || tags.length > 0 || pendingTag) && !isSubmitting;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 w-full max-w-4xl -translate-x-1/2 px-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-lg">
        {/* Selection Count */}
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
            {selectedCount} selected
          </span>
          <Button onClick={onClearSelection} variant="ghost" size="sm" title="Clear selection">
            <X />
            Clear
          </Button>
        </div>

        {/* Category & Tag Fields */}
        <div className="flex min-w-64 flex-1 flex-wrap items-center gap-3">
          {/* Category Input / Select */}
          <div className="flex items-center gap-2">
            <FolderPlus className="size-4 shrink-0 text-muted-foreground" />
            {!isCustomCategoryMode ? (
              <select
                value={selectedCategory}
                onChange={(e) => {
                  if (e.target.value === "__NEW__") {
                    setIsCustomCategoryMode(true);
                    setSelectedCategory("");
                  } else {
                    setSelectedCategory(e.target.value);
                  }
                }}
                className="h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="">Set category&hellip;</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="__NEW__">+ Create new category&hellip;</option>
              </select>
            ) : (
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  placeholder="New category name..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="h-8 w-40"
                  autoFocus
                />
                <Button
                  type="button"
                  onClick={() => {
                    setIsCustomCategoryMode(false);
                    setCustomCategory("");
                  }}
                  variant="ghost"
                  size="icon-sm"
                  title="Cancel custom category"
                >
                  <X />
                </Button>
              </div>
            )}
          </div>

          {/* Tags Multi-Value Input */}
          <div className="flex min-h-9 min-w-48 flex-1 flex-wrap items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1">
            <Tag className="size-4 shrink-0 text-muted-foreground" />
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {t}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  aria-label={`Remove tag ${t}`}
                  className="transition-colors hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder={tags.length === 0 ? "Add tags (press Enter)..." : "Add tag..."}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleKeyDownTag}
              onBlur={handleAddTag}
              className="min-w-24 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={handleApply} disabled={!canApply} variant="secondary" size="sm">
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Check />}
            Apply changes
          </Button>

          <Button onClick={onUnsubscribe} disabled={isSubmitting} variant="destructive" size="sm">
            <Trash2 />
            Unsubscribe selected
          </Button>
        </div>
      </div>
    </div>
  );
}
