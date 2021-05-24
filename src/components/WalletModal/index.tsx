import React, { useEffect, useState } from 'react'
import { UnsupportedChainIdError, useWeb3React } from '@web3-react/core'
import { fortmatic, injected, portis } from '../../connectors'
import { useModalOpen, useWalletModalToggle } from '../../state/application/hooks'

import { AbstractConnector } from '@web3-react/abstract-connector'
import AccountDetails from '../AccountDetails'
import { ApplicationModal } from '../../state/application/actions'
import { ButtonError } from '../ButtonLegacy'
import ExternalLink from '../ExternalLink'
import Image from 'next/image'
import Modal from '../Modal'
import { OVERLAY_READY } from '../../connectors/Fortmatic'
import Option from './Option'
import PendingView from './PendingView'
import ReactGA from 'react-ga'
import { SUPPORTED_WALLETS } from '../../constants'
import { WalletConnectConnector } from '@web3-react/walletconnect-connector'
import { isMobile } from 'react-device-detect'
import styled from 'styled-components'
import { t } from '@lingui/macro'
import { useLingui } from '@lingui/react'
import usePrevious from '../../hooks/usePrevious'

const CloseIcon = styled.div`
    position: absolute;
    right: 1rem;
    top: 14px;
    &:hover {
        cursor: pointer;
        opacity: 0.6;
    }
`

// const CloseColor = styled(Close)`
//     path {
//         stroke: ${({ theme }) => theme.text4};
//     }
// `

const Wrapper = styled.div`
    // ${({ theme }) => theme.flexColumnNoWrap}
    margin: 0;
    padding: 0;
    width: 100%;
`

const HeaderRow = styled.div`
    // ${({ theme }) => theme.flexRowNoWrap};
    padding: 1rem 1rem;
    font-weight: 500;
    color: ${(props) => (props.color === 'blue' ? ({ theme }) => theme.primary1 : 'inherit')};
    // ${({ theme }) => theme.mediaWidth.upToMedium`
    padding: 1rem;
  `};
`

const ContentWrapper = styled.div`
    // background-color: ${({ theme }) => theme.bg2};
    // padding: 2rem;
    border-bottom-left-radius: 20px;
    border-bottom-right-radius: 20px;

    // ${({ theme }) => theme.mediaWidth.upToMedium`padding: 1rem`};
`

const UpperSection = styled.div`
    position: relative;

    h5 {
        margin: 0;
        margin-bottom: 0.5rem;
        font-size: 1rem;
        font-weight: 400;
    }

    h5:last-child {
        margin-bottom: 0px;
    }

    h4 {
        margin-top: 0;
        font-weight: 500;
    }
`

const Blurb = styled.div`
    // ${({ theme }) => theme.flexRowNoWrap}
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 2rem;
    // ${({ theme }) => theme.mediaWidth.upToMedium`
    //     margin: 1rem;
    //     font-size: 12px;
    //   `};
`

const OptionGrid = styled.div`
    display: grid;
    grid-gap: 10px;
    // ${({ theme }) => theme.mediaWidth.upToMedium`
    grid-template-columns: 1fr;
    grid-gap: 10px;
  `};
`

const HoverText = styled.div`
    :hover {
        cursor: pointer;
    }
`

const WALLET_VIEWS = {
    OPTIONS: 'options',
    OPTIONS_SECONDARY: 'options_secondary',
    ACCOUNT: 'account',
    PENDING: 'pending',
}

export default function WalletModal({
    pendingTransactions,
    confirmedTransactions,
    ENSName,
}: {
    pendingTransactions: string[] // hashes of pending
    confirmedTransactions: string[] // hashes of confirmed
    ENSName?: string
}) {
    // important that these are destructed from the account-specific web3-react context
    const { active, account, connector, activate, error, deactivate } = useWeb3React()

    const { i18n } = useLingui()

    const [walletView, setWalletView] = useState(WALLET_VIEWS.ACCOUNT)

    const [pendingWallet, setPendingWallet] = useState<AbstractConnector | undefined>()

    const [pendingError, setPendingError] = useState<boolean>()

    const walletModalOpen = useModalOpen(ApplicationModal.WALLET)

    const toggleWalletModal = useWalletModalToggle()

    const previousAccount = usePrevious(account)

    // close on connection, when logged out before
    useEffect(() => {
        if (account && !previousAccount && walletModalOpen) {
            toggleWalletModal()
        }
    }, [account, previousAccount, toggleWalletModal, walletModalOpen])

    // always reset to account view
    useEffect(() => {
        if (walletModalOpen) {
            setPendingError(false)
            setWalletView(WALLET_VIEWS.ACCOUNT)
        }
    }, [walletModalOpen])

    // close modal when a connection is successful
    const activePrevious = usePrevious(active)
    const connectorPrevious = usePrevious(connector)
    useEffect(() => {
        if (
            walletModalOpen &&
            ((active && !activePrevious) || (connector && connector !== connectorPrevious && !error))
        ) {
            setWalletView(WALLET_VIEWS.ACCOUNT)
        }
    }, [setWalletView, active, error, connector, walletModalOpen, activePrevious, connectorPrevious])

    const tryActivation = async (connector: AbstractConnector | undefined) => {
        let name = ''
        Object.keys(SUPPORTED_WALLETS).map((key) => {
            if (connector === SUPPORTED_WALLETS[key].connector) {
                return (name = SUPPORTED_WALLETS[key].name)
            }
            return true
        })
        // log selected wallet
        ReactGA.event({
            category: 'Wallet',
            action: 'Change Wallet',
            label: name,
        })
        setPendingWallet(connector) // set wallet for pending view
        setWalletView(WALLET_VIEWS.PENDING)

        // if the connector is walletconnect and the user has already tried to connect, manually reset the connector
        if (connector instanceof WalletConnectConnector && connector.walletConnectProvider?.wc?.uri) {
            connector.walletConnectProvider = undefined
        }

        connector &&
            activate(connector, undefined, true).catch((error) => {
                if (error instanceof UnsupportedChainIdError) {
                    activate(connector) // a little janky...can't use setError because the connector isn't set
                } else {
                    setPendingError(true)
                }
            })
    }

    // close wallet modal if fortmatic modal is active
    useEffect(() => {
        fortmatic.on(OVERLAY_READY, () => {
            toggleWalletModal()
        })
    }, [toggleWalletModal])

    // get wallets user can switch too, depending on device/browser
    function getOptions() {
        const isMetamask = window.ethereum && window.ethereum.isMetaMask
        return Object.keys(SUPPORTED_WALLETS).map((key) => {
            const option = SUPPORTED_WALLETS[key]

            // check for mobile options
            if (isMobile) {
                //disable portis on mobile for now
                if (option.connector === portis) {
                    return null
                }

                if (!window.web3 && !window.ethereum && option.mobile) {
                    return (
                        <Option
                            onClick={() => {
                                option.connector !== connector && !option.href && tryActivation(option.connector)
                            }}
                            id={`connect-${key}`}
                            key={key}
                            active={option.connector && option.connector === connector}
                            color={option.color}
                            link={option.href}
                            header={option.name}
                            subheader={null}
                            icon={'/images/wallets/' + option.iconName}
                        />
                    )
                }
                return null
            }

            // overwrite injected when needed
            if (option.connector === injected) {
                // don't show injected if there's no injected provider
                if (!(window.web3 || window.ethereum)) {
                    if (option.name === 'MetaMask') {
                        return (
                            <Option
                                id={`connect-${key}`}
                                key={key}
                                color={'#E8831D'}
                                header={'Install Metamask'}
                                subheader={null}
                                link={'https://metamask.io/'}
                                icon="/metamask.png"
                            />
                        )
                    } else {
                        return null //dont want to return install twice
                    }
                }
                // don't return metamask if injected provider isn't metamask
                else if (option.name === 'MetaMask' && !isMetamask) {
                    return null
                }
                // likewise for generic
                else if (option.name === 'Injected' && isMetamask) {
                    return null
                }
            }

            // return rest of options
            return (
                !isMobile &&
                !option.mobileOnly && (
                    <Option
                        id={`connect-${key}`}
                        onClick={() => {
                            option.connector === connector
                                ? setWalletView(WALLET_VIEWS.ACCOUNT)
                                : !option.href && tryActivation(option.connector)
                        }}
                        key={key}
                        active={option.connector === connector}
                        color={option.color}
                        link={option.href}
                        header={option.name}
                        subheader={null} //use option.descriptio to bring back multi-line
                        icon={'/images/wallets/' + option.iconName}
                    />
                )
            )
        })
    }

    function getModalContent() {
        if (error) {
            return (
                <UpperSection>
                    <CloseIcon onClick={toggleWalletModal}>
                        <Image src="/x.svg" width="16px" height="16px" />;
                    </CloseIcon>
                    <HeaderRow style={{ paddingLeft: 0, paddingRight: 0 }}>
                        {error instanceof UnsupportedChainIdError
                            ? i18n._(t`Wrong Network`)
                            : i18n._(t`Error connecting`)}
                    </HeaderRow>
                    <ContentWrapper>
                        {error instanceof UnsupportedChainIdError ? (
                            <h5>{i18n._(t`Please connect to the appropriate Ethereum network.`)}</h5>
                        ) : (
                            i18n._(t`Error connecting. Try refreshing the page.`)
                        )}
                        <div style={{ marginTop: '1rem' }} />
                        <ButtonError error={true} size="small" onClick={deactivate}>
                            {i18n._(t`Disconnect`)}
                        </ButtonError>
                    </ContentWrapper>
                </UpperSection>
            )
        }
        if (account && walletView === WALLET_VIEWS.ACCOUNT) {
            return (
                <AccountDetails
                    toggleWalletModal={toggleWalletModal}
                    pendingTransactions={pendingTransactions}
                    confirmedTransactions={confirmedTransactions}
                    ENSName={ENSName}
                    openOptions={() => setWalletView(WALLET_VIEWS.OPTIONS)}
                />
            )
        }
        return (
            <UpperSection>
                <CloseIcon onClick={toggleWalletModal}>
                    <Image src="/x.svg" width="16px" height="16px" />;
                </CloseIcon>
                {walletView !== WALLET_VIEWS.ACCOUNT ? (
                    <HeaderRow color="blue">
                        <HoverText
                            onClick={() => {
                                setPendingError(false)
                                setWalletView(WALLET_VIEWS.ACCOUNT)
                            }}
                        >
                            {i18n._(t`Back`)}
                        </HoverText>
                    </HeaderRow>
                ) : (
                    <HeaderRow>
                        <HoverText>{i18n._(t`Connect to a wallet`)}</HoverText>
                    </HeaderRow>
                )}
                <ContentWrapper>
                    {walletView === WALLET_VIEWS.PENDING ? (
                        <PendingView
                            connector={pendingWallet}
                            error={pendingError}
                            setPendingError={setPendingError}
                            tryActivation={tryActivation}
                        />
                    ) : (
                        <OptionGrid>{getOptions()}</OptionGrid>
                    )}
                    {walletView !== WALLET_VIEWS.PENDING && (
                        <Blurb>
                            <span>{i18n._(t`New to Ethereum?`)} &nbsp;</span>{' '}
                            <ExternalLink href="https://ethereum.org/wallets/">
                                {i18n._(t`Learn more about wallets`)}
                            </ExternalLink>
                        </Blurb>
                    )}
                </ContentWrapper>
            </UpperSection>
        )
    }

    return (
        <Modal isOpen={walletModalOpen} onDismiss={toggleWalletModal} minHeight={false} maxHeight={90}>
            <Wrapper>{getModalContent()}</Wrapper>
        </Modal>
    )
}