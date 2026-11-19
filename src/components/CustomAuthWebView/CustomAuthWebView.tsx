import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { CustomAuthWebViewProps, PkceData } from './types';
import { saveCallbackParams, saveUserData, saveTokenData } from './authStorage';
import { generatePkce, buildAuthorizationUrl, fetchUserProfile, getOAuthConfig, exchangeWorkshopCode } from './authService';
import { isWorkshopMode } from '../../services/workshopIssuer';
import { getWorkshopTokenProblem } from '../../services/workshopToken';
import { Container, Header, BackButton, HeaderTitle, InitContainer, StyledWebView, LoadingOverlay, LoadingText } from './styles';

export const CustomAuthWebView: React.FC<CustomAuthWebViewProps> = ({ onSuccess, onError, onCancel }) => {
  const webViewRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [pkce, setPkce] = useState<PkceData | null>(null);
  const [state] = useState(() => Crypto.randomUUID());
  const redirectHandled = useRef(false);

  useEffect(() => {
    generatePkce().then(setPkce);
  }, []);

  useEffect(() => {
    if (!isWorkshopMode || pageLoaded) return;
    const timeout = setTimeout(() => onError('A tela de autenticação não carregou. Verifique a conexão e os certificados do emulador.'), 20000);
    return () => clearTimeout(timeout);
  }, [pageLoaded, onError]);

  const handleAuthorizationCode = async (code: string, currentPkce: PkceData) => {
    setIsAuthenticating(true);
    try {
      if (isWorkshopMode) {
        const token = await exchangeWorkshopCode(code, currentPkce);
        const problem = getWorkshopTokenProblem(token.access_token);
        if (problem) throw new Error(problem);
        const user = { name: 'Participante da oficina' };
        await saveUserData(user);
        await saveTokenData(token);
        onSuccess({ user, accessToken: token.access_token });
      } else {
        const response = await fetchUserProfile(code, currentPkce);
        const { accessToken, ...user } = response;
        await saveUserData(user);
        if (accessToken) {
          await saveTokenData({ access_token: accessToken });
        }
        onSuccess({ user, accessToken: accessToken ?? null });
      }
    } catch (error: any) {
      onError(error?.message || 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleOAuthRedirect = (url: string) => {
    if (redirectHandled.current) return;
    const params = Object.fromEntries(new URL(url).searchParams.entries());
    if (isWorkshopMode && params.state !== state) {
      onError('Estado da autorização inválido. Tente novamente.');
      return;
    }
    redirectHandled.current = true;
    if (params.error) { onError(`Authentication error: ${params.error}`); return; }
    if (!params.code) { onError('No authorization code received'); return; }

    saveCallbackParams(params).then(() => handleAuthorizationCode(params.code, pkce!));
  };

  const isRedirectUrl = (url?: string) => !!url?.startsWith(getOAuthConfig().redirectUri);

  const onShouldStartLoadWithRequest = (request: any) => {
    if (isRedirectUrl(request.url)) { handleOAuthRedirect(request.url); return false; }
    return true;
  };

  const onNavigationStateChange = (navState: any) => {
    if (isRedirectUrl(navState.url)) handleOAuthRedirect(navState.url);
  };

  useEffect(() => {
    if (!isWorkshopMode || !pkce) return;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (isRedirectUrl(url)) handleOAuthRedirect(url);
    });
    Linking.getInitialURL().then((url) => {
      if (url && isRedirectUrl(url) && new URL(url).searchParams.get('state') === state) {
        handleOAuthRedirect(url);
      }
    }).catch(() => {});
    return () => subscription.remove();
  }, [pkce, state]);

  if (!pkce) {
    return (
      <InitContainer>
        <ActivityIndicator size="large" color="#1351B4" />
        <LoadingText>Inicializando autenticação...</LoadingText>
      </InitContainer>
    );
  }

  return (
    <Container>
      <Header>
        <BackButton onPress={onCancel}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </BackButton>
        <HeaderTitle>{isWorkshopMode ? 'Autenticação da oficina' : 'Autenticação Gov.br'}</HeaderTitle>
      </Header>
      <StyledWebView
        ref={webViewRef}
        source={{ uri: buildAuthorizationUrl(pkce, isWorkshopMode ? state : undefined) }}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onLoadStart={() => { if (!isWorkshopMode) setIsLoading(true); }}
        onLoadEnd={() => { setPageLoaded(true); setIsLoading(false); }}
        onError={(e: any) => onError(e.nativeEvent.description)}
        onRenderProcessGone={() => onError('WebView process gone')}
        incognito
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        mixedContentMode="compatibility"
        userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36"
      />
      {((!isWorkshopMode && isLoading) || isAuthenticating) && (
        <LoadingOverlay>
          <ActivityIndicator size="large" color="#1351B4" />
          <LoadingText>{isAuthenticating ? 'Autenticando...' : 'Carregando...'}</LoadingText>
        </LoadingOverlay>
      )}
    </Container>
  );
};
