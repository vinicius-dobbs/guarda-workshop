import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Image, Dimensions, Text } from 'react-native';

const { height } = Dimensions.get('window');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CustomAuthWebView } from '../../components/CustomAuthWebView';
import { isWorkshopMode } from '../../services/workshopIssuer';
import {
  Container,
  ScrollContainer,
  Content,
  Header,
  LoginSection,
  LoginTitle,
  LoginDescription,
  GovButton,
  GovButtonText,
  FooterText,
  BackButton,
} from './styles';

export default function Login({ onLogin, onBack }) {
  const insets = useSafeAreaInsets();
  const [showWebView, setShowWebView] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleSuccess = async (authData: any) => {
    setShowWebView(false);
    onLogin(authData);
  };

  const handleError = (error: string) => {
    if (isWorkshopMode) {
      setLoginError(error);
    } else {
      console.error('Auth error:', error);
    }
    setShowWebView(false);
  };

  if (showWebView) {
    return (
      <CustomAuthWebView
        onCancel={() => setShowWebView(false)}
        onSuccess={handleSuccess}
        onError={handleError}
      />
    );
  }

  return (
    <Container>
      {onBack && (
        <BackButton onPress={onBack} style={{ paddingTop: insets.top }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </BackButton>
      )}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollContainer 
          contentContainerStyle={{ 
            flexGrow: 1,
            paddingTop: insets.top, 
            paddingBottom: insets.bottom 
          }}
        >
          <Content>
            <Header>
              <Image source={require('../../../assets/carteira_documentos.png')} style={{ width: '100%', height: height * 0.36, resizeMode: 'contain' }} />
            </Header>

            <LoginSection>
              <LoginTitle>Bem-vindo</LoginTitle>
              <LoginDescription>
                {isWorkshopMode
                  ? 'Entre com uma identidade de teste para acessar as credenciais da oficina.'
                  : 'Faça login com sua conta gov.br para acessar seus documentos digitais'}
              </LoginDescription>
              <GovButton onPress={() => { setLoginError(''); setShowWebView(true); }} activeOpacity={0.8}>
                <Ionicons name="shield-outline" size={24} color="#FFFFFF" />
                <GovButtonText>{isWorkshopMode ? 'Entrar na oficina' : 'Entrar com gov.br'}</GovButtonText>
              </GovButton>
              {!!loginError && <Text style={{ color: '#B91C1C', marginTop: 16, textAlign: 'center' }}>{loginError}</Text>}
            </LoginSection>
            <FooterText>
              Ao continuar, você concorda com os Termos de Uso e Política de Privacidade.
            </FooterText>
          </Content>
        </ScrollContainer>
      </KeyboardAvoidingView>
    </Container>
  );
}
