import React, { useEffect, useState } from 'react';

/**
 * ChatInput Component
 * Exposes a text input field for submitting prompts.
 * Automatically resizes dynamically, handles Shift+Enter newlines, and disables during loads.
 *
 * @param {object} props
 * @param {function} props.onSend - Callback when message is submitted.
 * @param {boolean} props.loading - Loading state of the request.
 * @param {object} props.inputRef - Input focus element reference.
 */
const ChatInput = ({ onSend, loading, inputRef }) => {
  const [text, setText] = useState('');

  const adjustHeight = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [text]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (loading || !text.trim()) return;
    onSend(text);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end space-x-3 bg-white border border-[#e8e4dc] p-3 rounded-2xl shadow-xs"
    >
      <textarea
        ref={inputRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? 'Drishyamitra AI is thinking...' : 'Ask Drishyamitra anything...'}
        disabled={loading}
        className="flex-grow resize-none bg-transparent outline-none text-sm max-h-[150px] min-h-[24px] py-1 text-[#0f0e0c] placeholder-[#6b6760] font-sans overflow-y-auto"
      />
      <button
        type="submit"
        disabled={loading || !text.trim()}
        className="px-4 py-2 bg-[#c8501a] disabled:bg-[#f2f0eb] text-white disabled:text-[#6b6760] text-xs font-mono uppercase tracking-widest rounded-xl transition active:scale-95 cursor-pointer disabled:cursor-not-allowed h-9 flex items-center justify-center font-bold"
      >
        Send
      </button>
    </form>
  );
};

export default ChatInput;
