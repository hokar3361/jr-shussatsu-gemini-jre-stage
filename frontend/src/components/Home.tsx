import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Card, CardContent, Grid } from '@mui/material';
import { Train, History } from '@mui/icons-material';
import { styled } from '@mui/material/styles';

const StyledCard = styled(Card)(() => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
  cursor: 'pointer',
  background: 'linear-gradient(145deg, #ffffff 0%, #E9F1E8 100%)',
  border: '3px solid #0A8C0D20',
  '&:hover': {
    transform: 'translateY(-8px) scale(1.02)',
    boxShadow: '0 20px 40px rgba(10,140,13,0.25)',
    borderColor: '#0A8C0D',
  },
}));

const IconWrapper = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: 180,
  height: 180,
  borderRadius: '50%',
  margin: '0 auto 30px',
  background: 'linear-gradient(135deg, #0A8C0D 0%, #1FAD20 100%)',
  boxShadow: '0 10px 30px rgba(10,140,13,0.3)',
  [theme.breakpoints.down('lg')]: {
    width: 150,
    height: 150,
  },
  [theme.breakpoints.down('md')]: {
    width: 120,
    height: 120,
  },
  [theme.breakpoints.down('sm')]: {
    width: 80,
    height: 80,
    margin: '0 auto 16px',
  },
}));

const Home: React.FC = () => {
  const navigate = useNavigate();



  const menuItems = [
    {
      title: '発券システム',
      description: 'AI音声対話による切符発券',
      icon: <Train sx={{ 
        fontSize: { xs: 48, sm: 80, md: 100, lg: 120 },
        color: 'white',
      }} />,
      path: '/ticket',
    },
    {
      title: '会話履歴',
      description: 'フィードバック確認・録音再生',
      icon: <History sx={{ 
        fontSize: { xs: 48, sm: 80, md: 100, lg: 120 },
        color: 'white',
      }} />,
      path: '/history',
    },
  ];

  return (
    <Box sx={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center',
      alignItems: 'center',
      px: 2,
      py: 2,
      overflow: 'auto' 
    }}>
      <Box sx={{ textAlign: 'center', mb: { xs: 2, md: 4 } }}>
        <Typography
          component="h1"
          gutterBottom
          sx={{
            fontSize: { 
              xs: '2rem', 
              sm: '3rem', 
              md: '4rem',
              lg: '5rem',
              xl: '6rem' 
            },
            fontWeight: 800,
            background: 'linear-gradient(135deg, #0A8C0D 0%, #1FAD20 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 1,
            lineHeight: 1.2,
          }}
        >
          JR発券システム
        </Typography>
        <Typography sx={{ 
          fontSize: { 
            xs: '1rem', 
            sm: '1.25rem', 
            md: '1.5rem',
            lg: '1.75rem' 
          },
          color: 'text.secondary',
        }}>
          AI音声対話による次世代発券サービス
        </Typography>
      </Box>
      <Grid container spacing={{ xs: 2, sm: 3, md: 4 }} justifyContent="center" alignItems="center" sx={{ 
        width: '100%', 
        maxWidth: { xs: '100%', md: '1400px', xl: '1800px' }, 
        flexShrink: 0,
      }}>
        {menuItems.map((item) => (
          <Grid size={{ xs: 12, sm: 12, md: 6, lg: 6, xl: 5 }} key={item.path}>
            <StyledCard onClick={() => navigate(item.path)} sx={{ 
              height: { xs: 'auto', md: '100%' }, 
              minHeight: { xs: 'auto', sm: 'auto', md: 400, lg: 450, xl: 500 },
              maxWidth: { xs: '500px', md: '900px' },
              margin: '0 auto',
            }}>
              <CardContent sx={{ 
                textAlign: 'center', 
                py: { xs: 2, sm: 2.5, md: 3, lg: 4 }, 
                px: { xs: 2, sm: 3, md: 4 },
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <IconWrapper>
                  {item.icon}
                </IconWrapper>
                <Typography sx={{ 
                  fontSize: { 
                    xs: '1.5rem', 
                    sm: '1.75rem', 
                    md: '2.5rem',
                    lg: '3rem',
                    xl: '3.5rem' 
                  },
                  fontWeight: 700, 
                  mb: { xs: 1, md: 2 },
                  lineHeight: 1.2,
                }}>
                  {item.title}
                </Typography>
                <Typography sx={{ 
                  fontSize: { 
                    xs: '0.9rem', 
                    sm: '1rem', 
                    md: '1.5rem',
                    lg: '1.75rem',
                    xl: '2rem' 
                  },
                  color: 'text.secondary',
                  lineHeight: 1.3,
                }}>
                  {item.description}
                </Typography>
              </CardContent>
            </StyledCard>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: { xs: 2, md: 4 }, textAlign: 'center' }}>
        <Typography sx={{ 
          fontSize: { 
            xs: '0.875rem', 
            sm: '1rem', 
            md: '1.125rem',
            lg: '1.25rem' 
          },
          color: '#0A8C0D',
          fontWeight: 500,
        }}>
          © 2025 JR発券システム. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
};

export default Home;