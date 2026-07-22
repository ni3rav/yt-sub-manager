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
    const categoryValue = isCustomCategoryMode
      ? customCategory.trim()
      : selectedCategory.trim();

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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4">
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Selection Count */}
        <div className="flex items-center gap-3">
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {selectedCount} selected
          </div>
          <button
            onClick={onClearSelection}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        {/* Category & Tag Fields */}
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[300px]">
          {/* Category Input / Select */}
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-slate-400 shrink-0" />
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
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-red-500/50"
              >
                <option value="">-- Set Category --</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="__NEW__">+ Create New Category...</option>
              </select>
            ) : (
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  placeholder="New category name..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs h-8 px-2.5 w-40 text-slate-200"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomCategoryMode(false);
                    setCustomCategory("");
                  }}
                  className="text-slate-400 hover:text-slate-200 p-1"
                  title="Cancel custom category"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Tags Multi-Value Input */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 min-h-[36px] flex-1">
            <Tag className="w-4 h-4 text-slate-400 shrink-0" />
            {tags.map((t) => (
              <span
                key={t}
                className="bg-slate-800 text-slate-200 text-xs px-2 py-0.5 rounded flex items-center gap-1 border border-slate-700"
              >
                {t}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  className="hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
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
              className="bg-transparent text-xs text-slate-200 focus:outline-none flex-1 min-w-[100px]"
            />
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleApply}
            disabled={!canApply}
            size="sm"
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs px-3.5 h-9 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Check className="w-4 h-4 mr-1.5 text-emerald-400" />
            )}
            Apply Changes
          </Button>

          <Button
            onClick={onUnsubscribe}
            disabled={isSubmitting}
            size="sm"
            className="bg-red-600 hover:bg-red-500 text-white font-medium text-xs px-3.5 h-9 shadow-lg shadow-red-600/20 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            Unsubscribe Selected
          </Button>
        </div>
      </div>
    </div>
  );
}
