import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
} from '@mui/material';
import FeedbackIcon from '@mui/icons-material/Feedback';

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (feedback: string) => void;
}

const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ open, onClose, onSubmit }) => {
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!feedback.trim()) {
      setError('フィードバック内容を入力してください');
      return;
    }
    onSubmit(feedback);
    setFeedback('');
    setError('');
    onClose();
  };

  const handleClose = () => {
    setFeedback('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FeedbackIcon color="primary" />
          <Typography variant="h6">フィードバック送信</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          AIとの会話について、お気づきの点やご意見をお聞かせください。
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={4}
          variant="outlined"
          placeholder="例：AIの回答が適切でなかった、音声認識がうまくいかなかった等"
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            if (error) setError('');
          }}
          error={!!error}
          helperText={error}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit">
          キャンセル
        </Button>
        <Button onClick={handleSubmit} variant="contained" color="primary">
          送信
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FeedbackDialog;