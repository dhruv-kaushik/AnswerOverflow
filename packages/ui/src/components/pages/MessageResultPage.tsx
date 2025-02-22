import type { ChannelPublicWithFlags, MessageFull } from '@answeroverflow/db';
import type { ServerPublic } from '@answeroverflow/api';
import type { QAPage, WithContext } from 'schema-dts';
import { getMainSiteHostname } from '@answeroverflow/constants/src/links';
import { ServerInvite } from '../primitives/server-invite';
import {
	Message,
	MessageContentWithSolution,
} from '../primitives/message/Message';
import { Heading } from '../primitives/ui/heading';

import Link from '../primitives/ui/link';
import { MessagesSearchBar } from '../primitives/messages-search-bar';
import { fetchIsUserInServer } from '../../utils/fetch-is-user-in-server';
import { TrackLoad } from '../primitives/ui/track-load';
import {
	channelToAnalyticsData,
	serverToAnalyticsData,
	threadToAnalyticsData,
} from '@answeroverflow/constants/src/analytics';
import { messageWithDiscordAccountToAnalyticsData } from '@answeroverflow/hooks';
import { stripMarkdownAndHTML } from '../primitives/message/markdown/strip';
import { TrackLinkButton } from '../primitives/ui/track-link-button';
import { LazyInviteToAnswerOverflowPopover } from './message-result-page/lazy-invite-to-answer-overflow-popover';

export type MessageResultPageProps = {
	messages: MessageFull[];
	server: ServerPublic;
	channel: ChannelPublicWithFlags;
	thread?: ChannelPublicWithFlags;
	tenant: ServerPublic | undefined;
	requestedId: string;
	relatedPosts: {
		message: MessageFull;
		thread: ChannelPublicWithFlags;
	}[];
};

const JoinAnswerOverflowCard = () => (
	<div
		className={
			'flex flex-col gap-4 rounded-md border-2 border-solid border-secondary p-4'
		}
	>
		<span
			className={'text-xl font-bold '}
			style={{
				textWrap: 'balance',
			}}
		>
			Want results from more Discord servers?
		</span>
		<div className={'grid w-full grid-cols-2 gap-4'}>
			<TrackLinkButton
				eventName={'Join Answer Overflow From Message Result Page'}
				eventData={{}}
				variant={'default'}
				target={'_blank'}
				href={'https://app.answeroverflow.com/onboarding'}
			>
				Add your server
			</TrackLinkButton>
			<LazyInviteToAnswerOverflowPopover />
		</div>
	</div>
);

// TODO: Align text to be same level with the avatar
export async function MessageResultPage({
	messages,
	server,
	channel,
	thread,
	tenant,
	relatedPosts,
}: MessageResultPageProps) {
	const isUserInServer = await fetchIsUserInServer(server.id);
	const firstMessage = messages.at(0);
	if (!firstMessage) throw new Error('No message found'); // TODO: Handle this better

	const solutionMessageId = messages.at(0)?.solutions?.at(0)?.id;
	const solution = messages.find((message) => message.id === solutionMessageId);
	let consecutivePrivateMessages = 0;

	let contents = '';
	const messagesWithMergedContent = messages.map((message, index) => {
		const nextMessage = messages.at(index + 1);
		contents += message.content;
		const isSameAuthor =
			message.author.id === nextMessage?.author.id && message.public;
		const isCollapsible =
			message.attachments.length === 0 &&
			message.embeds?.length === 0 &&
			message.id !== solutionMessageId &&
			message.public;
		const isNextMessageCollapsible =
			nextMessage?.attachments.length === 0 &&
			nextMessage?.embeds?.length === 0 &&
			nextMessage?.id !== solutionMessageId &&
			nextMessage?.public;
		if (isSameAuthor && isCollapsible && isNextMessageCollapsible) {
			contents += '\n';
			return null;
		}
		const mergedContent = contents;
		contents = '';
		return {
			...message,
			content: mergedContent,
		};
	});

	const messagesToDisplay = messagesWithMergedContent.filter(Boolean);

	const messageStack = messagesToDisplay.map((message, index) => {
		const nextMessage = messagesToDisplay.at(index + 1);
		if (!message.public && isUserInServer !== 'in_server') {
			consecutivePrivateMessages++;
			if (nextMessage && !nextMessage.public) {
				return;
			}
		} else {
			consecutivePrivateMessages = 0;
		}
		if (message.author.id === '958907348389339146') return null;

		const Msg = ({ count }: { count: number }) => {
			const shouldShowSolutionInContent = index === 0 && solution;

			return (
				<Message
					key={message.id}
					message={message}
					fullRounded
					content={
						shouldShowSolutionInContent ? (
							<MessageContentWithSolution
								solution={solution}
								message={message}
								showJumpToSolutionCTA
								loadingStyle={
									message.id === solutionMessageId ? 'eager' : 'lazy'
								}
							/>
						) : undefined
					}
					showBorders={message.id !== solutionMessageId}
					loadingStyle={message.id === solutionMessageId ? 'eager' : 'lazy'}
					numberOfMessages={count}
				/>
			);
		};

		if (message.id === solutionMessageId) {
			return (
				<div
					className="text-green-700 dark:text-green-400"
					key={message.id}
					id={`solution-${message.id}`}
				>
					Solution
					<div
						className="rounded-lg border-2 border-green-500  dark:border-green-400 "
						key={message.id}
					>
						<Msg key={message.id} count={consecutivePrivateMessages} />
					</div>
				</div>
			);
		}

		return <Msg key={message.id} count={consecutivePrivateMessages} />;
	});

	const question = thread?.name ?? firstMessage.content?.slice(0, 100);
	const isFirstMessageSolution = solution && solution.id !== firstMessage.id;
	const qaHeader: WithContext<QAPage> = {
		'@context': 'https://schema.org',
		'@type': 'QAPage',
		mainEntity: {
			'@type': 'Question',
			name: stripMarkdownAndHTML(question),
			text: stripMarkdownAndHTML(firstMessage.content),
			answerCount: solution && !isFirstMessageSolution ? 1 : 0,
			acceptedAnswer:
				solution && !isFirstMessageSolution
					? {
							'@type': 'Answer',
							text: stripMarkdownAndHTML(solution.content),
							url: `https://${server.customDomain ?? getMainSiteHostname()}/m/${
								solution.id
							}#solution-${solution.id}`,
					  }
					: undefined,
		},
	};

	const Main = () => (
		<div className={'flex grow flex-col'}>
			<div className="mb-2 flex flex-col-reverse items-center justify-between gap-2 sm:flex-row sm:py-0 md:my-8">
				<div className="flex h-full w-full grow flex-col items-center justify-between gap-2 md:gap-4">
					<MessagesSearchBar className={'hidden md:block'} />
					<div className={'block xl:hidden'}>
						<ServerInvite
							server={server}
							location={'Message Result Page'}
							channel={channel}
							JoinButton={null}
						/>
					</div>
					<div className="flex w-full flex-row items-center justify-start rounded-sm border-b-2 border-solid border-neutral-400  text-center  dark:border-neutral-600 dark:text-white">
						<h1 className="w-full text-center font-header text-xl text-primary md:text-left md:text-3xl">
							{question}
						</h1>
					</div>
				</div>
			</div>
			<div className="rounded-md">
				<div className="flex flex-col gap-4">{messageStack}</div>
			</div>
			<div className="mt-4 flex flex-col items-center justify-center gap-4 text-center">
				<Heading.H2 className={'text-lg md:text-2xl'}>
					Looking for more? Join the community!
				</Heading.H2>
				<div className={'w-full max-w-[300px]'}>
					<ServerInvite
						server={server}
						channel={channel}
						location="Message Result Page"
					/>
				</div>
			</div>
		</div>
	);

	const adsEnabled = !tenant;

	const Sidebar = () => (
		<div className="flex w-full shrink-0 flex-col items-center gap-4 text-center xl:mt-6 xl:w-[400px]">
			<div className={'hidden w-full  xl:block'}>
				<ServerInvite
					server={server}
					channel={channel}
					location="Message Result Page"
				/>
			</div>
			<div className="flex w-full flex-col justify-center gap-4 text-center xl:mt-6 ">
				{!tenant && <JoinAnswerOverflowCard />}
				{adsEnabled && (
					<div className={'w-full'}>
						<div
							className={'min-h-[220px] text-white'}
							// NextJS is dumb and lifts script tags to <head/> so we have to use dangerouslySetInnerHTML
							dangerouslySetInnerHTML={{
								__html:
									'<script\n' +
									'\t\t\t\t\t\t\tasync\n' +
									'\t\t\t\t\t\t\ttype="text/javascript"\n' +
									'\t\t\t\t\t\t\tsrc="//cdn.carbonads.com/carbon.js?serve=CWYIV53I&placement=wwwansweroverflowcom&format=cover"\n' +
									'\t\t\t\t\t\t\tid="_carbonads_js"\n' +
									'\t\t\t\t\t\t></script>' +
									'',
							}}
						/>
					</div>
				)}
				{relatedPosts.length > 0 && (
					<>
						<span className="text-2xl">Recommended Posts</span>
						<div className="flex flex-col gap-4">
							{relatedPosts.slice(0, messages.length * 2).map((post) => (
								<Link
									className="flex flex-col gap-2 rounded-md border-2 border-solid border-secondary p-4 text-left transition-colors duration-700 ease-out hover:border-primary hover:text-primary"
									href={`/m/${post.message.id}`}
									key={post.thread.id}
								>
									<span className="truncate text-lg font-semibold">
										{post.thread.name}
									</span>
									<span className="truncate text-sm">
										{post.message.content.slice(0, 100)}
									</span>
								</Link>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	);
	const rendered = (
		<div className="sm:mx-3">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(qaHeader) }}
			/>
			<div className="flex flex-col gap-8 xl:flex-row">
				<Main />
				<Sidebar />
				<TrackLoad
					eventName={'Message Page View'}
					eventData={{
						...channelToAnalyticsData(channel),
						...serverToAnalyticsData(server),
						...(thread && {
							...threadToAnalyticsData(thread),
							'Number of Messages': messages.length,
						}),
						...messageWithDiscordAccountToAnalyticsData(firstMessage),
					}}
				/>
			</div>
		</div>
	);
	return rendered;
}

export default MessageResultPage;
